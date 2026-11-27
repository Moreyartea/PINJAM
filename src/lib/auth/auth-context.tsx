"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiClientError, normalizeUnknownError } from "@/lib/api/errors";
import {
  getActiveAccessToken,
  getAuthProviderAdapter,
  setActiveAccessToken,
} from "@/lib/auth/provider-adapter";
import { services } from "@/services";
import type { AuthCredentials } from "@/services/contracts";
import type { UserProfile } from "@/types/domain";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "expired" | "error";

export type AuthFailureKind = "AUTH_FAILURE" | "PROFILE_FAILURE" | "NETWORK_FAILURE";

/**
 * Classifies authentication and backend failures:
 * - AUTH_FAILURE: Token invalid/expired (401, AUTH_REQUIRED). Must clear token & redirect.
 * - PROFILE_FAILURE: Profile not in public.users (404) or UNKNOWN_ROLE. Do NOT destroy Supabase session.
 * - NETWORK_FAILURE: 500, 502, 503, timeout, network error. Keep session/token active, allow retry.
 */
export function classifyAuthError(err: unknown): {
  kind: AuthFailureKind;
  apiError: ApiClientError;
} {
  const apiError = normalizeUnknownError(err);
  const status = apiError.status;
  const code = apiError.code;

  if (status === 401 || code === "AUTH_REQUIRED" || code === "INVALID_CREDENTIALS") {
    return { kind: "AUTH_FAILURE", apiError };
  }

  if (
    status === 404 ||
    code === "NOT_FOUND" ||
    code === "UNKNOWN_ROLE" ||
    (status === 403 && code !== "AUTH_REQUIRED")
  ) {
    return { kind: "PROFILE_FAILURE", apiError };
  }

  return { kind: "NETWORK_FAILURE", apiError };
}

export interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  error: ApiClientError | null;
  signIn: (credentials: AuthCredentials) => Promise<UserProfile>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<UserProfile | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);

  // Sequence tracking to ignore stale responses and prevent race conditions
  const syncSeqRef = useRef<number>(0);
  // Token for which profile load was last executed or active
  const lastSyncedTokenRef = useRef<string | null>(null);
  // Timer for scheduling async work outside the Supabase synchronous callback
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stateRef = useRef({ user, status });
  useEffect(() => {
    stateRef.current = { user, status };
  }, [user, status]);

  const performProfileLoad = useCallback(
    async (token: string, seq: number): Promise<UserProfile | null> => {
      try {
        setActiveAccessToken(token);
        const response = await services.me.getMe();

        // Discard stale responses if a newer event occurred while request was in-flight
        if (seq !== syncSeqRef.current) {
          return null;
        }

        const profile = response.data;
        if (!profile || !profile.role || !["ADMIN", "STAFF", "KOMTING"].includes(profile.role)) {
          throw new ApiClientError({
            status: 403,
            code: "UNKNOWN_ROLE",
            message: "Peran pengguna tidak dikenali oleh sistem PINJAM.",
          });
        }

        lastSyncedTokenRef.current = token;
        setUser(profile);
        setStatus("authenticated");
        setError(null);
        return profile;
      } catch (err) {
        // Discard stale errors if a newer event occurred
        if (seq !== syncSeqRef.current) {
          return null;
        }

        const { kind, apiError } = classifyAuthError(err);
        setUser(null);
        setError(apiError);

        if (kind === "AUTH_FAILURE") {
          // Token is invalid/expired -> clear token and mark expired/unauthenticated
          setActiveAccessToken(null);
          lastSyncedTokenRef.current = null;
          setStatus(
            apiError.status === 401 || apiError.code === "AUTH_REQUIRED"
              ? "expired"
              : "unauthenticated"
          );
        } else if (kind === "PROFILE_FAILURE") {
          // User not in public.users or role invalid.
          // Disallow access to app modules, but DO NOT destroy Supabase session.
          setStatus("unauthenticated");
        } else {
          // NETWORK_FAILURE (500, 502, 503, timeout, network error):
          // Maintain temporary authentication. DO NOT destroy Supabase session or clear valid token.
          // Set status to "error" allowing retry.
          setStatus("error");
        }

        return null;
      }
    },
    []
  );

  const scheduleProfileSync = useCallback(
    (token: string) => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }

      const seq = ++syncSeqRef.current;

      // Schedule asynchronously outside Supabase callback to prevent lock contention / deadlock
      syncTimerRef.current = setTimeout(() => {
        void performProfileLoad(token, seq);
      }, 0);
    },
    [performProfileLoad]
  );

  useEffect(() => {
    let active = true;
    const adapter = getAuthProviderAdapter();
    let unsubscribe: (() => void) | undefined;

    if (adapter?.onAuthStateChange) {
      unsubscribe = adapter.onAuthStateChange((event, session) => {
        if (!active) return;

        if (event === "SIGNED_OUT" || !session?.access_token) {
          syncSeqRef.current += 1;
          if (syncTimerRef.current) {
            clearTimeout(syncTimerRef.current);
          }
          lastSyncedTokenRef.current = null;
          setActiveAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
          setError(null);
          return;
        }

        const token = session.access_token;
        setActiveAccessToken(token);

        if (event === "TOKEN_REFRESHED") {
          // Token is updated in memory for all subsequent API calls.
          // Keep current user state active without redundant fetch if already authenticated.
          lastSyncedTokenRef.current = token;
          return;
        }

        // Prevent duplicate calls if already synced and authenticated
        if (
          token === lastSyncedTokenRef.current &&
          stateRef.current.user !== null &&
          stateRef.current.status === "authenticated"
        ) {
          return;
        }

        scheduleProfileSync(token);
      });
    } else {
      async function bootstrapSession() {
        try {
          const session = await services.auth.getSession();
          if (!active) return;

          if (!session?.access_token) {
            setActiveAccessToken(null);
            setUser(null);
            setStatus("unauthenticated");
            return;
          }

          const token = session.access_token;
          setActiveAccessToken(token);
          scheduleProfileSync(token);
        } catch (err) {
          if (!active) return;
          const { kind, apiError } = classifyAuthError(err);
          setUser(null);
          setError(apiError);
          if (kind === "NETWORK_FAILURE") {
            setStatus("error");
          } else {
            setActiveAccessToken(null);
            setStatus("unauthenticated");
          }
        }
      }

      void bootstrapSession();
    }

    return () => {
      active = false;
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [scheduleProfileSync]);

  const signIn = useCallback(async (credentials: AuthCredentials): Promise<UserProfile> => {
    setError(null);
    setStatus("loading");

    const session = await services.auth.signInWithPassword(credentials);
    const token = session.access_token;
    setActiveAccessToken(token);

    syncSeqRef.current += 1;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    try {
      const response = await services.me.getMe();
      const profile = response.data;

      if (!profile || !profile.role || !["ADMIN", "STAFF", "KOMTING"].includes(profile.role)) {
        throw new ApiClientError({
          status: 403,
          code: "UNKNOWN_ROLE",
          message: "Peran pengguna tidak dikenali oleh sistem PINJAM.",
        });
      }

      lastSyncedTokenRef.current = token;
      setUser(profile);
      setStatus("authenticated");
      setError(null);
      return profile;
    } catch (err) {
      const { kind, apiError } = classifyAuthError(err);
      setUser(null);
      setError(apiError);

      if (kind === "AUTH_FAILURE") {
        setActiveAccessToken(null);
        lastSyncedTokenRef.current = null;
        setStatus(
          apiError.status === 401 || apiError.code === "AUTH_REQUIRED"
            ? "expired"
            : "unauthenticated"
        );
        try {
          await services.auth.signOut();
        } catch {
          // ignore
        }
      } else if (kind === "PROFILE_FAILURE") {
        // DO NOT signOut from Supabase!
        setStatus("unauthenticated");
      } else {
        // NETWORK_FAILURE (500, 502, 503, timeout, network error):
        // DO NOT signOut from Supabase!
        // DO NOT clear in-memory token!
        setStatus("error");
      }

      throw apiError;
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    syncSeqRef.current += 1;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    lastSyncedTokenRef.current = null;

    try {
      await services.auth.signOut();
    } finally {
      setActiveAccessToken(null);
      setUser(null);
      setError(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshMe = useCallback(async (): Promise<UserProfile | null> => {
    setStatus("loading");
    setError(null);

    let token = getActiveAccessToken();
    if (!token) {
      const session = await services.auth.getSession();
      token = session?.access_token ?? null;
      if (token) {
        setActiveAccessToken(token);
      }
    }

    if (!token) {
      setActiveAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
      return null;
    }

    const seq = ++syncSeqRef.current;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    return performProfileLoad(token, seq);
  }, [performProfileLoad]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      signIn,
      signOut,
      refreshMe,
      clearError,
    }),
    [status, user, error, signIn, signOut, refreshMe, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return ctx;
}

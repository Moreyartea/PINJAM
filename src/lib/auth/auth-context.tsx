"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiClientError, normalizeUnknownError } from "@/lib/api/errors";
import { getAuthProviderAdapter, setActiveAccessToken } from "@/lib/auth/provider-adapter";
import { services } from "@/services";
import type { AuthCredentials } from "@/services/contracts";
import type { UserProfile } from "@/types/domain";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "expired";

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

  const loadCurrentUser = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const response = await services.me.getMe();
      const profile = response.data;

      // Rule: Never trust client metadata; backend public.users is the source of truth.
      // Must validate that the role is a valid PINJAM UserRole.
      if (!profile || !profile.role || !["ADMIN", "STAFF", "KOMTING"].includes(profile.role)) {
        throw new ApiClientError({
          status: 403,
          code: "UNKNOWN_ROLE",
          message: "Peran pengguna tidak dikenali oleh sistem PINJAM.",
        });
      }

      setUser(profile);
      setStatus("authenticated");
      setError(null);
      return profile;
    } catch (err) {
      const apiError = normalizeUnknownError(err);
      setActiveAccessToken(null);
      setUser(null);

      if (apiError.status === 401 || apiError.code === "AUTH_REQUIRED") {
        setStatus("expired");
      } else {
        setStatus("unauthenticated");
      }

      setError(apiError);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const adapter = getAuthProviderAdapter();
    let unsubscribe: (() => void) | undefined;

    if (adapter?.onAuthStateChange) {
      unsubscribe = adapter.onAuthStateChange(async (event, session) => {
        if (!active) return;

        if (event === "SIGNED_OUT" || !session?.access_token) {
          setActiveAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
          return;
        }

        setActiveAccessToken(session.access_token);

        if (event === "TOKEN_REFRESHED") {
          // Keep current active session in memory without unseating user profile
          return;
        }

        await loadCurrentUser();
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

          setActiveAccessToken(session.access_token);
          await loadCurrentUser();
        } catch (err) {
          if (!active) return;
          setActiveAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
          setError(normalizeUnknownError(err));
        }
      }

      void bootstrapSession();
    }

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [loadCurrentUser]);

  const signIn = useCallback(async (credentials: AuthCredentials): Promise<UserProfile> => {
    setError(null);
    const session = await services.auth.signInWithPassword(credentials);
    setActiveAccessToken(session.access_token);

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

      setUser(profile);
      setStatus("authenticated");
      return profile;
    } catch (err) {
      setActiveAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
      try {
        await services.auth.signOut();
      } catch {
        // ignore sign out error
      }
      throw err;
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
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
    const session = await services.auth.getSession();
    if (!session?.access_token) {
      setActiveAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
      return null;
    }
    setActiveAccessToken(session.access_token);
    return loadCurrentUser();
  }, [loadCurrentUser]);

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

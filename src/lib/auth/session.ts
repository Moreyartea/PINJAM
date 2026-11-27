import "server-only";

import { AuthError } from "@/lib/auth/errors";
import {
  createSupabaseAuthUserRepository,
  mapPublicUserToProfile,
  syncAuthUserWithProfile,
} from "@/lib/auth/sync-user";
import type {
  AuthUserRepository,
  LoginCredentials,
  LoginResult,
  SessionContextResult,
  SupabaseAuthIdentity,
} from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseBearerClient, createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthClientLike {
  auth: {
    getUser(jwt?: string): Promise<{
      data: { user: SupabaseAuthIdentity | null };
      error: { message: string } | null;
    }>;
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: {
        user: SupabaseAuthIdentity | null;
        session: { expires_at?: number | null } | null;
      };
      error: { message: string } | null;
    }>;
    signOut(): Promise<{ error: { message: string } | null }>;
  };
}

export interface SessionDependencies {
  createServerClient?: () => Promise<AuthClientLike>;
  createBearerClient?: (token: string) => AuthClientLike;
  revokeBearerToken?: (token: string) => Promise<void>;
  userRepository?: AuthUserRepository;
}

/**
 * Extracts a Bearer token from an Authorization header if properly formatted.
 * Returns null if header is absent; returns "" if header is present but invalid.
 */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }

  const trimmed = authorizationHeader.trim();
  const match = /^Bearer\s+(\S+)$/i.exec(trimmed);
  if (!match || !match[1]) {
    return "";
  }

  return match[1];
}

function formatSessionExpiry(expiresAtEpochSeconds?: number | null): string | null {
  if (typeof expiresAtEpochSeconds !== "number" || !Number.isFinite(expiresAtEpochSeconds)) {
    return null;
  }
  return new Date(expiresAtEpochSeconds * 1000).toISOString();
}

/**
 * Resolves the authenticated application user from either an explicit
 * Authorization Bearer token or Next.js SSR session cookies.
 *
 * Always verifies the user via Supabase Auth `getUser()` and loads authoritative
 * role/account_status from `public.users`.
 */
export async function getServerSessionContext(
  request?: Request,
  deps: SessionDependencies = {}
): Promise<SessionContextResult> {
  const createServer = deps.createServerClient ?? createSupabaseServerClient;
  const createBearer = deps.createBearerClient ?? createSupabaseBearerClient;

  const authHeader = request?.headers.get("authorization") ?? null;
  const bearerToken = extractBearerToken(authHeader);

  let authUser: SupabaseAuthIdentity | null = null;

  if (bearerToken !== null) {
    if (!bearerToken) {
      return { authenticated: false, reason: "INVALID_SESSION", context: null };
    }

    const client = createBearer(bearerToken);
    const { data, error } = await client.auth.getUser(bearerToken);
    if (error || !data.user) {
      return { authenticated: false, reason: "INVALID_SESSION", context: null };
    }
    authUser = data.user;
  } else {
    const client = await createServer();
    const { data, error } = await client.auth.getUser();
    if (error) {
      return { authenticated: false, reason: "INVALID_SESSION", context: null };
    }
    if (!data.user) {
      return {
        authenticated: false,
        reason: "UNAUTHENTICATED",
        context: null,
      };
    }
    authUser = data.user;
  }

  const repository = deps.userRepository ?? createSupabaseAuthUserRepository();
  const syncResult = await syncAuthUserWithProfile(authUser, repository);
  if (syncResult.status === "NOT_FOUND") {
    return { authenticated: false, reason: "PROFILE_NOT_FOUND", context: null };
  }

  const profileRow = syncResult.profile;
  const assignment =
    profileRow.role === "KOMTING"
      ? await repository.findActiveKomtingAssignment(profileRow.id)
      : null;

  const userProfile = mapPublicUserToProfile(profileRow, assignment);

  return {
    authenticated: true,
    context: {
      authUserId: authUser.id,
      user: userProfile,
      rawUser: profileRow,
      komtingAssignment: userProfile.komting_assignment ?? null,
    },
  };
}

/**
 * Authenticates an existing PINJAM user via Supabase Auth email/password,
 * validates public.users existence and ACTIVE account status, and clears
 * session cookies immediately if the account is unprovisioned or inactive.
 */
export async function signInWithEmailPassword(
  credentials: LoginCredentials,
  deps: SessionDependencies = {}
): Promise<LoginResult> {
  const email = credentials.email.trim().toLowerCase();
  const password = credentials.password;

  if (!email || !password) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Email dan kata sandi wajib diisi.",
      details: [
        ...(!email ? [{ field: "email", reason: "REQUIRED" }] : []),
        ...(!password ? [{ field: "password", reason: "REQUIRED" }] : []),
      ],
    });
  }

  const createServer = deps.createServerClient ?? createSupabaseServerClient;
  const repository = deps.userRepository ?? createSupabaseAuthUserRepository();
  const client = await createServer();

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw new AuthError({
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Email atau kata sandi tidak valid.",
    });
  }

  const syncResult = await syncAuthUserWithProfile(data.user, repository);
  if (syncResult.status === "NOT_FOUND") {
    await client.auth.signOut().catch(() => null);
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Akun belum terdaftar pada sistem PINJAM.",
    });
  }

  const profileRow = syncResult.profile;
  if (profileRow.account_status !== "ACTIVE") {
    await client.auth.signOut().catch(() => null);
    throw new AuthError({
      status: 403,
      code: "ACCOUNT_NOT_ACTIVE",
      message: "Akun Anda belum aktif atau sedang dinonaktifkan.",
    });
  }

  const assignment =
    profileRow.role === "KOMTING"
      ? await repository.findActiveKomtingAssignment(profileRow.id)
      : null;

  return {
    user: mapPublicUserToProfile(profileRow, assignment),
    session: {
      expires_at: formatSessionExpiry(data.session.expires_at),
    },
  };
}

function isRequestObject(value: Request | SessionDependencies | undefined): value is Request {
  return typeof Request !== "undefined" && value instanceof Request;
}

function isOutsideNextRequestScopeError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("was called outside a request scope");
}

/**
 * Signs out the current Supabase Auth session:
 * - Revokes an Authorization Bearer session on Supabase Auth server if present.
 * - Clears SSR session cookies when an SSR cookie context is present.
 */
export async function signOutCurrentSession(
  request?: Request,
  deps?: SessionDependencies
): Promise<void>;
export async function signOutCurrentSession(deps?: SessionDependencies): Promise<void>;
export async function signOutCurrentSession(
  requestOrDeps?: Request | SessionDependencies,
  maybeDeps: SessionDependencies = {}
): Promise<void> {
  const request = isRequestObject(requestOrDeps) ? requestOrDeps : undefined;
  const deps: SessionDependencies = isRequestObject(requestOrDeps)
    ? maybeDeps
    : (requestOrDeps ?? {});

  const authHeader = request?.headers.get("authorization") ?? null;
  const bearerToken = extractBearerToken(authHeader);

  if (bearerToken === "") {
    throw new AuthError({
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Format token autentikasi tidak valid.",
    });
  }

  if (bearerToken) {
    const revoke =
      deps.revokeBearerToken ??
      (async (token: string) => {
        const admin = createSupabaseAdminClient();
        const { error } = await admin.auth.admin.signOut(token, "local");
        if (!error) {
          return;
        }

        const authErr = error as {
          name?: string;
          status?: number;
          code?: string;
          message: string;
        };

        if (authErr.name === "AuthSessionMissingError" || authErr.code === "session_not_found") {
          return;
        }

        if (authErr.status === 400 || authErr.status === 401 || authErr.status === 403) {
          throw new AuthError({
            status: 401,
            code: "AUTH_REQUIRED",
            message: "Token sesi tidak valid atau sudah kedaluwarsa.",
          });
        }

        throw new Error(authErr.message);
      });

    try {
      await revoke(bearerToken);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: "Gagal mengakhiri sesi autentikasi.",
      });
    }
  }

  const hasCookieHeader = Boolean(request?.headers.get("cookie"));
  const shouldClearSsrCookies = Boolean(deps.createServerClient) || !bearerToken || hasCookieHeader;

  if (!shouldClearSsrCookies) {
    return;
  }

  try {
    const createServer = deps.createServerClient ?? createSupabaseServerClient;
    const client = await createServer();
    const { error } = await client.auth.signOut();

    if (error) {
      throw new AuthError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: "Gagal mengakhiri sesi autentikasi.",
      });
    }
  } catch (error) {
    if (bearerToken && isOutsideNextRequestScopeError(error)) {
      return;
    }
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Gagal mengakhiri sesi autentikasi.",
    });
  }
}

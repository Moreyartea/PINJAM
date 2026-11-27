import "server-only";

import { AuthError } from "@/lib/auth/errors";
import { getServerSessionContext, type SessionDependencies } from "@/lib/auth/session";
import type {
  ActiveKomtingContext,
  AllowedRoles,
  AuthenticatedUserContext,
  RequireAuthenticatedOptions,
} from "@/lib/auth/types";

/**
 * Verifies authentication against Supabase Auth + public.users.
 * Rejects unauthenticated, invalid sessions, unprovisioned profiles, and
 * non-ACTIVE accounts unless `allowNonActive: true` is explicitly passed.
 */
export async function requireAuthenticatedUser(
  request?: Request,
  options: RequireAuthenticatedOptions = {},
  deps: SessionDependencies = {}
): Promise<AuthenticatedUserContext> {
  const result = await getServerSessionContext(request, deps);

  if (!result.authenticated) {
    if (result.reason === "PROFILE_NOT_FOUND") {
      throw new AuthError({
        status: 403,
        code: "FORBIDDEN",
        message: "Profil pengguna belum terdaftar pada sistem PINJAM.",
      });
    }

    throw new AuthError({
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Sesi login tidak valid atau telah berakhir.",
    });
  }

  if (!options.allowNonActive && result.context.rawUser.account_status !== "ACTIVE") {
    throw new AuthError({
      status: 403,
      code: "ACCOUNT_NOT_ACTIVE",
      message: "Akun Anda belum aktif atau sedang dinonaktifkan.",
    });
  }

  return result.context;
}

/**
 * Enforces that the authenticated ACTIVE user holds one of the allowed roles
 * from public.users (never from client/JWT mutable metadata).
 */
export async function requireRole(
  allowedRoles: AllowedRoles,
  request?: Request,
  deps: SessionDependencies = {}
): Promise<AuthenticatedUserContext> {
  const context = await requireAuthenticatedUser(request, { allowNonActive: false }, deps);

  if (!allowedRoles.includes(context.user.role)) {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Role pengguna tidak memiliki izin untuk aksi ini.",
    });
  }

  return context;
}

/**
 * Enforces an ACTIVE KOMTING account with an ACTIVE komting_assignments row.
 */
export async function requireActiveKomting(
  request?: Request,
  deps: SessionDependencies = {}
): Promise<ActiveKomtingContext> {
  const context = await requireRole(["KOMTING"], request, deps);

  if (!context.komtingAssignment || context.komtingAssignment.status !== "ACTIVE") {
    throw new AuthError({
      status: 403,
      code: "KOMTING_ASSIGNMENT_REQUIRED",
      message: "Penugasan komting aktif diperlukan untuk mengakses fitur ini.",
    });
  }

  return context as ActiveKomtingContext;
}

/**
 * Enforces an ACTIVE STAFF or ADMIN user.
 */
export async function requireStaffOrAdmin(
  request?: Request,
  deps: SessionDependencies = {}
): Promise<AuthenticatedUserContext> {
  return requireRole(["STAFF", "ADMIN"], request, deps);
}

/**
 * Enforces an ACTIVE ADMIN user.
 */
export async function requireAdmin(
  request?: Request,
  deps: SessionDependencies = {}
): Promise<AuthenticatedUserContext> {
  return requireRole(["ADMIN"], request, deps);
}

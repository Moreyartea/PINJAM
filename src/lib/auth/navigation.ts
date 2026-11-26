import type { UserRole } from "@/types/domain";

const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  KOMTING: "/komting",
  STAFF: "/staff",
  ADMIN: "/admin",
};

/**
 * Returns the home dashboard route for a given role.
 * Never used as security enforcement; backend remains the authorization source of truth.
 */
export function getDefaultRouteForRole(role: UserRole): string {
  return ROLE_HOME_ROUTES[role] ?? "/";
}

/**
 * Checks whether the current role is permitted for a UI route guard.
 */
export function isRoleAllowed(role: UserRole | undefined, allowedRoles: UserRole[]): boolean {
  if (!role) return false;
  return allowedRoles.includes(role);
}

/**
 * Sanitizes internal redirect paths to prevent open redirects.
 */
export function sanitizeInternalRedirect(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }
  return trimmed;
}

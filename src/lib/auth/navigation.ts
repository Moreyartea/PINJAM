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

/**
 * Checks whether a given path is accessible for a specific user role.
 */
export function isPathAllowedForRole(pathname: string, role: UserRole): boolean {
  const cleanPath = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  if (cleanPath.startsWith("/admin")) {
    return role === "ADMIN";
  }
  if (cleanPath.startsWith("/staff")) {
    return role === "STAFF" || role === "ADMIN";
  }
  if (cleanPath.startsWith("/komting") || cleanPath.startsWith("/application")) {
    return role === "KOMTING";
  }
  return true;
}

/**
 * Resolves post-login redirection target enforcing:
 * 1. Default routes per role (KOMTING -> /komting, STAFF -> /staff, ADMIN -> /admin).
 * 2. ADMIN logging in normally lands on /admin, even if next=/staff was present due to expired session.
 * 3. Deep-links that are explicitly requested and allowed for the role (e.g. /staff/scan for ADMIN) are honored.
 * 4. Unauthorized role routes or open external URLs are rejected and fallback to default route.
 * 5. Prevents redirect loops.
 */
export function resolvePostLoginRedirect(
  role: UserRole,
  rawNextPath: string | null | undefined,
  accountStatus?: string
): string {
  if (role === "KOMTING" && accountStatus === "PENDING_VERIFICATION") {
    return "/application/status";
  }

  const defaultRoute = getDefaultRouteForRole(role);
  const nextPath = sanitizeInternalRedirect(rawNextPath);

  if (!nextPath) {
    return defaultRoute;
  }

  const cleanPath = nextPath.split("?")[0]?.replace(/\/+$/, "") || "/";

  // Prevent redirect loops or landing on auth/root pages
  if (
    cleanPath === "/" ||
    cleanPath === "/login" ||
    cleanPath === "/register" ||
    cleanPath === "/forbidden"
  ) {
    return defaultRoute;
  }

  // Requirement: ADMIN logging in normally must land on /admin, even if next=/staff was carried from expired session
  if (role === "ADMIN" && cleanPath === "/staff") {
    return "/admin";
  }

  // Deep-link validation: path must be permitted for user's role
  if (isPathAllowedForRole(cleanPath, role)) {
    return nextPath;
  }

  return defaultRoute;
}

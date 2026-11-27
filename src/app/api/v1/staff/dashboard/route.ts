import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import type { SessionDependencies } from "@/lib/auth/session";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import {
  getStaffDashboardData,
  type StaffDashboardServiceDeps,
} from "@/lib/staff/staff-dashboard-service";

export interface StaffDashboardRouteDeps {
  sessionDeps?: SessionDependencies;
  dashboardDeps?: StaffDashboardServiceDeps;
}

type RouteContext =
  | { params?: Promise<Record<string, string | string[]>> }
  | StaffDashboardRouteDeps
  | undefined;

export async function GET(request: Request, routeOptions?: RouteContext) {
  const requestId = createRequestId();

  try {
    const isCustomDeps =
      routeOptions &&
      typeof routeOptions === "object" &&
      ("sessionDeps" in routeOptions || "dashboardDeps" in routeOptions);

    const deps: StaffDashboardRouteDeps = isCustomDeps
      ? (routeOptions as StaffDashboardRouteDeps)
      : {};

    const context = await requireStaffOrAdmin(request, deps.sessionDeps);
    const summary = await getStaffDashboardData(context, deps.dashboardDeps);
    return jsonSuccess(summary, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

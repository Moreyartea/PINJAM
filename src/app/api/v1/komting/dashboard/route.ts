import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireRole } from "@/lib/auth/guards";
import type { SessionDependencies } from "@/lib/auth/session";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import {
  getKomtingDashboardData,
  type KomtingDashboardServiceDeps,
} from "@/lib/komting/komting-dashboard-service";

export interface KomtingDashboardRouteDeps {
  sessionDeps?: SessionDependencies;
  dashboardDeps?: KomtingDashboardServiceDeps;
}

type RouteContext =
  | { params?: Promise<Record<string, string | string[]>> }
  | KomtingDashboardRouteDeps
  | undefined;

export async function GET(request: Request, routeOptions?: RouteContext) {
  const requestId = createRequestId();

  try {
    const isCustomDeps =
      routeOptions &&
      typeof routeOptions === "object" &&
      ("sessionDeps" in routeOptions || "dashboardDeps" in routeOptions);

    const deps: KomtingDashboardRouteDeps = isCustomDeps
      ? (routeOptions as KomtingDashboardRouteDeps)
      : {};

    const context = await requireRole(["KOMTING"], request, deps.sessionDeps);
    const summary = await getKomtingDashboardData(context, deps.dashboardDeps);
    return jsonSuccess(summary, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

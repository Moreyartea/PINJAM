import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import type { SessionDependencies } from "@/lib/auth/session";
import { createRequestId, jsonList } from "@/lib/http/response";
import {
  listStaffMaintenance,
  type MaintenanceServiceDeps,
} from "@/lib/maintenance/maintenance-service";

export interface StaffMaintenanceRouteDeps {
  sessionDeps?: SessionDependencies;
  serviceDeps?: MaintenanceServiceDeps;
}

type RouteContext =
  | { params?: Promise<Record<string, string | string[]>> }
  | StaffMaintenanceRouteDeps
  | undefined;

export async function GET(request: Request, routeOptions?: RouteContext) {
  const requestId = createRequestId();

  try {
    const isCustomDeps =
      routeOptions &&
      typeof routeOptions === "object" &&
      ("sessionDeps" in routeOptions || "serviceDeps" in routeOptions);

    const deps: StaffMaintenanceRouteDeps = isCustomDeps
      ? (routeOptions as StaffMaintenanceRouteDeps)
      : {};

    const context = await requireStaffOrAdmin(request, deps.sessionDeps);
    const result = await listStaffMaintenance(context, request.url, deps.serviceDeps);
    return jsonList(result.items, result.pagination, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

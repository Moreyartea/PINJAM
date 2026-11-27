import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import type { SessionDependencies } from "@/lib/auth/session";
import { createRequestId, jsonList } from "@/lib/http/response";
import {
  listAdminAuditLogs,
  type AuditServiceDeps,
} from "@/lib/audit/audit-service";

export interface AdminAuditLogsRouteDeps {
  sessionDeps?: SessionDependencies;
  serviceDeps?: AuditServiceDeps;
}

type RouteContext =
  | { params?: Promise<Record<string, string | string[]>> }
  | AdminAuditLogsRouteDeps
  | undefined;

export async function GET(request: Request, routeOptions?: RouteContext) {
  const requestId = createRequestId();

  try {
    const isCustomDeps =
      routeOptions &&
      typeof routeOptions === "object" &&
      ("sessionDeps" in routeOptions || "serviceDeps" in routeOptions);

    const deps: AdminAuditLogsRouteDeps = isCustomDeps
      ? (routeOptions as AdminAuditLogsRouteDeps)
      : {};

    const context = await requireAdmin(request, deps.sessionDeps);
    const result = await listAdminAuditLogs(context, request.url, deps.serviceDeps);
    return jsonList(result.items, result.pagination, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

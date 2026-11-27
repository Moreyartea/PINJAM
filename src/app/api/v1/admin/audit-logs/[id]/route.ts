import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import type { SessionDependencies } from "@/lib/auth/session";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import {
  getAdminAuditLogDetail,
  type AuditServiceDeps,
} from "@/lib/audit/audit-service";

export interface AdminAuditLogDetailRouteDeps {
  sessionDeps?: SessionDependencies;
  serviceDeps?: AuditServiceDeps;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  props: RouteParams | { params: Promise<{ id: string }>; routeDeps?: AdminAuditLogDetailRouteDeps }
) {
  const requestId = createRequestId();

  try {
    const { id } = await props.params;
    const deps = ("routeDeps" in props ? props.routeDeps : {}) as AdminAuditLogDetailRouteDeps;
    const context = await requireAdmin(request, deps?.sessionDeps);
    const item = await getAdminAuditLogDetail(context, id, deps?.serviceDeps);
    return jsonSuccess(item, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

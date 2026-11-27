import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import type { SessionDependencies } from "@/lib/auth/session";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import {
  completeStaffMaintenance,
  type MaintenanceServiceDeps,
} from "@/lib/maintenance/maintenance-service";

export interface StaffCompleteMaintenanceRouteDeps {
  sessionDeps?: SessionDependencies;
  serviceDeps?: MaintenanceServiceDeps;
}

type DynamicContext = {
  params: Promise<{ maintenanceId: string }> | { maintenanceId: string };
  sessionDeps?: SessionDependencies;
  serviceDeps?: MaintenanceServiceDeps;
};

export async function POST(request: Request, routeContext: DynamicContext) {
  const requestId = createRequestId();

  try {
    const deps = routeContext as StaffCompleteMaintenanceRouteDeps;
    const context = await requireStaffOrAdmin(request, deps?.sessionDeps);
    const resolvedParams = await Promise.resolve(routeContext.params);
    const maintenanceId = resolvedParams.maintenanceId;

    const rawText = await request.text();
    let rawBody: unknown = null;
    if (rawText.trim().length > 0) {
      try {
        rawBody = JSON.parse(rawText);
      } catch {
        throw new AuthError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Body permintaan harus berupa JSON yang valid.",
        });
      }
    }

    const record = await completeStaffMaintenance(
      context,
      maintenanceId,
      rawBody,
      requestId,
      deps?.serviceDeps
    );
    return jsonSuccess(record, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

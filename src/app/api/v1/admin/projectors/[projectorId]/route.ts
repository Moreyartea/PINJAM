import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { updateProjector } from "@/lib/projectors/projector-service";

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ projectorId: string }> }
) {
  const requestId = createRequestId();

  try {
    const adminContext = await requireAdmin(request);
    const { projectorId } = await routeContext.params;
    const rawBody = await request.json().catch(() => null);
    if (rawBody === null) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body permintaan harus berupa JSON yang valid.",
      });
    }

    const updated = await updateProjector(adminContext, projectorId, rawBody, requestId);
    return jsonSuccess(updated, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { getProjectorDetail } from "@/lib/projectors/projector-service";

export async function GET(
  request: Request,
  routeContext: { params: Promise<{ projectorId: string }> }
) {
  const requestId = createRequestId();

  try {
    const context = await requireAuthenticatedUser(request);
    const { projectorId } = await routeContext.params;
    const result = await getProjectorDetail(context, projectorId);
    return jsonSuccess(result, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { deactivateProjector } from "@/lib/projectors/projector-service";

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ projectorId: string }> }
) {
  const requestId = createRequestId();

  try {
    const adminContext = await requireAdmin(request);
    const { projectorId } = await routeContext.params;

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

    const result = await deactivateProjector(adminContext, projectorId, rawBody, requestId);
    return jsonSuccess(result, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

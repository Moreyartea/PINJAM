import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { deactivateKomtingAssignment } from "@/lib/komting/komting-service";

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ assignmentId: string }> }
) {
  const requestId = createRequestId();

  try {
    const adminContext = await requireAdmin(request);
    const { assignmentId } = await routeContext.params;
    const body = await request.json().catch(() => null);
    if (body === null) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body permintaan harus berupa JSON yang valid.",
      });
    }

    const result = await deactivateKomtingAssignment(adminContext, assignmentId, body, requestId);
    return jsonSuccess(result, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

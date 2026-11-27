import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { getMyProfile, updateMyProfile } from "@/lib/profile/me-service";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireAuthenticatedUser(request);
    return jsonSuccess(getMyProfile(context), { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireAuthenticatedUser(request);
    const rawBody = await request.json().catch(() => null);
    if (rawBody === null) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body permintaan harus berupa JSON yang valid.",
      });
    }

    const updated = await updateMyProfile(context, rawBody, requestId);
    return jsonSuccess(updated, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

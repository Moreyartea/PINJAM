import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireAuthenticatedUser(request);
    return jsonSuccess(
      {
        authenticated: true,
        user: context.user,
      },
      { status: 200, requestId }
    );
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

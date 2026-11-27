import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { signOutCurrentSession } from "@/lib/auth/session";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    await signOutCurrentSession(request);
    return jsonSuccess({ success: true }, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

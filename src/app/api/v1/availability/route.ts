import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { checkProjectorAvailability } from "@/lib/availability/availability-service";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    await requireAuthenticatedUser(request);
    const result = await checkProjectorAvailability(request.url);
    return jsonSuccess(result, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

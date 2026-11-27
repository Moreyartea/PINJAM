import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { getOperatingHoursForDate } from "@/lib/operating-hours/operating-hours-service";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    await requireAuthenticatedUser(request);
    const result = await getOperatingHoursForDate(request.url);
    return jsonSuccess(result, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

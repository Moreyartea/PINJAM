import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { updateOperatingHoursForDate } from "@/lib/operating-hours/operating-hours-service";

export async function PUT(request: Request, routeContext: { params: Promise<{ date: string }> }) {
  const requestId = createRequestId();

  try {
    const adminContext = await requireAdmin(request);
    const { date } = await routeContext.params;
    const rawBody = await request.json().catch(() => null);
    if (rawBody === null) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body permintaan harus berupa JSON yang valid.",
      });
    }

    const result = await updateOperatingHoursForDate(adminContext, date, rawBody, requestId);
    return jsonSuccess(result, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

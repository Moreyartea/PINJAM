import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireActiveKomting } from "@/lib/auth/guards";
import { createBooking } from "@/lib/bookings/booking-service";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireActiveKomting(request);
    const rawBody = await request.json().catch(() => null);
    if (rawBody === null) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body permintaan harus berupa JSON yang valid.",
      });
    }

    const idempotencyKey =
      request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");

    const result = await createBooking(context, rawBody, idempotencyKey, requestId);
    return jsonSuccess(result.body.data, { status: result.status, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

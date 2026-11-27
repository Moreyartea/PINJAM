import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { confirmPickup } from "@/lib/loans/loan-service";

interface RouteParams {
  params: Promise<{ bookingId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireStaffOrAdmin(request);
    const { bookingId } = await params;
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

    const result = await confirmPickup(context, bookingId, rawBody, idempotencyKey, requestId);
    return jsonSuccess(result.body.data, { status: result.status, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

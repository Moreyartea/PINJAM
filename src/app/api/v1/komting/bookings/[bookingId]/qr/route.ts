import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireActiveKomting } from "@/lib/auth/guards";
import { getBookingQrToken } from "@/lib/bookings/booking-service";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

interface RouteParams {
  params: Promise<{ bookingId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireActiveKomting(request);
    const { bookingId } = await params;
    const qr = await getBookingQrToken(context, bookingId);
    return jsonSuccess(qr, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

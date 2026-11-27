import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireActiveKomting } from "@/lib/auth/guards";
import { cancelBooking } from "@/lib/bookings/booking-service";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

interface RouteParams {
  params: Promise<{ bookingId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireActiveKomting(request);
    const { bookingId } = await params;
    const rawBody = await request.json().catch(() => null);

    const cancelled = await cancelBooking(context, bookingId, rawBody, requestId);
    return jsonSuccess(cancelled, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

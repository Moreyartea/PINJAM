import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import { getStaffBookingDetail } from "@/lib/bookings/booking-service";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

interface RouteParams {
  params: Promise<{ bookingId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireStaffOrAdmin(request);
    const { bookingId } = await params;
    const detail = await getStaffBookingDetail(context, bookingId);
    return jsonSuccess(detail, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

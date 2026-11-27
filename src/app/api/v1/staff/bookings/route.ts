import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import { listStaffBookings } from "@/lib/bookings/booking-service";
import { createRequestId, jsonList } from "@/lib/http/response";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireStaffOrAdmin(request);
    const { items, pagination } = await listStaffBookings(context, request.url);
    return jsonList(items, pagination, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

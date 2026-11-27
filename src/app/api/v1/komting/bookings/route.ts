import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireActiveKomting } from "@/lib/auth/guards";
import { listKomtingBookings } from "@/lib/bookings/booking-service";
import { createRequestId, jsonList } from "@/lib/http/response";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireActiveKomting(request);
    const { items, pagination } = await listKomtingBookings(context, request.url);
    return jsonList(items, pagination, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

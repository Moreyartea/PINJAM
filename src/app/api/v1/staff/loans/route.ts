import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonList } from "@/lib/http/response";
import { listStaffLoans } from "@/lib/loans/loan-service";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireStaffOrAdmin(request);
    const { items, pagination } = await listStaffLoans(context, request.url);
    return jsonList(items, pagination, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

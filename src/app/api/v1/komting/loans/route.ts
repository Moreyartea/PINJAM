import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireActiveKomting } from "@/lib/auth/guards";
import { createRequestId, jsonList } from "@/lib/http/response";
import { listKomtingLoans } from "@/lib/loans/loan-service";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireActiveKomting(request);
    const { items, pagination } = await listKomtingLoans(context, request.url);
    return jsonList(items, pagination, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

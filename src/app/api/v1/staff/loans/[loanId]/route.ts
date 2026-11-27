import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { getStaffLoanDetail } from "@/lib/loans/loan-service";

interface RouteParams {
  params: Promise<{ loanId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireStaffOrAdmin(request);
    const { loanId } = await params;
    const detail = await getStaffLoanDetail(context, loanId);
    return jsonSuccess(detail, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

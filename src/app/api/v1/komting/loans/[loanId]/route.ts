import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireActiveKomting } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { getKomtingLoanDetail } from "@/lib/loans/return-service";

interface RouteParams {
  params: Promise<{ loanId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireActiveKomting(request);
    const { loanId } = await params;
    const detail = await getKomtingLoanDetail(context, loanId);
    return jsonSuccess(detail, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

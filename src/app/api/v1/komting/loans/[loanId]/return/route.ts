import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireActiveKomting } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { initiateKomtingReturn } from "@/lib/loans/return-service";

interface RouteParams {
  params: Promise<{ loanId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireActiveKomting(request);
    const { loanId } = await params;
    const result = await initiateKomtingReturn(context, loanId);
    return jsonSuccess(result, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { approveKomtingApplication } from "@/lib/komting/komting-service";

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ applicationId: string }> }
) {
  const requestId = createRequestId();

  try {
    const adminContext = await requireAdmin(request);
    const { applicationId } = await routeContext.params;
    const body = await request.json().catch(() => ({}));
    const result = await approveKomtingApplication(adminContext, applicationId, body, requestId);
    return jsonSuccess(result, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { getAdminKomtingApplicationDetail } from "@/lib/komting/komting-service";

export async function GET(
  request: Request,
  routeContext: { params: Promise<{ applicationId: string }> }
) {
  const requestId = createRequestId();

  try {
    await requireAdmin(request);
    const { applicationId } = await routeContext.params;
    const detail = await getAdminKomtingApplicationDetail(applicationId);
    return jsonSuccess(detail, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

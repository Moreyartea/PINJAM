import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonList } from "@/lib/http/response";
import { listAdminKomtingApplications } from "@/lib/komting/komting-service";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    await requireAdmin(request);
    const result = await listAdminKomtingApplications(request.url);
    return jsonList(result.items, result.pagination, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

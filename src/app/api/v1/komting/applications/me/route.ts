import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireRole } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { getMyKomtingApplication } from "@/lib/komting/komting-service";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireRole(["KOMTING"], request);
    const application = await getMyKomtingApplication(context);
    return jsonSuccess(application, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

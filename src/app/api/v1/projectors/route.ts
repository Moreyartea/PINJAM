import { toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createRequestId, jsonList } from "@/lib/http/response";
import { listProjectors } from "@/lib/projectors/projector-service";

export async function GET(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireAuthenticatedUser(request);
    const result = await listProjectors(context, request.url);
    return jsonList(result.items, result.pagination, { status: 200, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

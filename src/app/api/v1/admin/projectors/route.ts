import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { createProjector } from "@/lib/projectors/projector-service";

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const adminContext = await requireAdmin(request);
    const rawBody = await request.json().catch(() => null);
    if (rawBody === null) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body permintaan harus berupa JSON yang valid.",
      });
    }

    const created = await createProjector(adminContext, rawBody, requestId);
    return jsonSuccess(created, { status: 201, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

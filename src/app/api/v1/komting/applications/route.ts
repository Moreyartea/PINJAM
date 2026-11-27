import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireRole } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { submitKomtingApplication } from "@/lib/komting/komting-service";

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const context = await requireRole(["KOMTING"], request);
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body permintaan harus berupa multipart/form-data yang valid.",
      });
    }

    const result = await submitKomtingApplication(context, formData, requestId);
    return jsonSuccess(result, { status: 201, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

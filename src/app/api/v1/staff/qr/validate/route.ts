import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { validateScannedQr } from "@/lib/qr/qr-service";

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    await requireStaffOrAdmin(request);
    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Body harus berupa objek JSON yang valid.",
      });
    }

    const record = rawBody as Record<string, unknown>;
    const res = await validateScannedQr({
      qrPayload: String(record.qr_payload ?? ""),
      action: record.action as "PICKUP" | "RETURN",
      requestId,
    });

    return jsonSuccess(res, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

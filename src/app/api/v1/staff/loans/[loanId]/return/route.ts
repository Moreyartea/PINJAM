import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { confirmStaffReturn, getStaffLoanReturnSummary } from "@/lib/loans/return-service";

interface RouteParams {
  params: Promise<{ loanId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireStaffOrAdmin(request);
    const { loanId } = await params;
    const summary = await getStaffLoanReturnSummary(context, loanId);
    return jsonSuccess(summary, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireStaffOrAdmin(request);
    const { loanId } = await params;

    const contentType = request.headers.get("content-type") || "";
    let parsedBody: Record<string, unknown> = {};

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData().catch(() => null);
      if (!formData) {
        throw new AuthError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Data form-data tidak valid.",
        });
      }

      parsedBody = {
        returned_by: formData.get("returned_by")?.toString() || undefined,
        representative_name: formData.get("representative_name")?.toString() || undefined,
        projector_condition: formData.get("projector_condition")?.toString() || undefined,
        accessories_condition: formData.get("accessories_condition")?.toString() || undefined,
        unit_disposition: formData.get("unit_disposition")?.toString() || undefined,
        note: formData.get("note")?.toString() || undefined,
        qr_payload: formData.get("qr_payload")?.toString() || undefined,
        evidence_photo_storage_key:
          formData.get("evidence_photo_storage_key")?.toString() || undefined,
        fine_amount:
          formData.get("fine_amount") !== null ? Number(formData.get("fine_amount")) : undefined,
        fine_notes: formData.get("fine_notes")?.toString() || undefined,
        evidence_photo: formData.get("evidence_photo") || undefined,
      };
    } else {
      const rawBody = await request.json().catch(() => null);
      if (rawBody === null || typeof rawBody !== "object" || Array.isArray(rawBody)) {
        throw new AuthError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Body permintaan harus berupa JSON yang valid.",
        });
      }
      parsedBody = rawBody as Record<string, unknown>;
    }

    const idempotencyKey =
      request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");

    const result = await confirmStaffReturn(context, loanId, parsedBody, idempotencyKey, requestId);

    return jsonSuccess(result.body.data, { status: result.status, requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

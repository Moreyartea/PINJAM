import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireStaffOrAdmin } from "@/lib/auth/guards";
import { createRequestId, jsonSuccess } from "@/lib/http/response";
import { getStaffInspectionDetail } from "@/lib/loans/inspection-service";

interface RouteParams {
  params: Promise<{ loanId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const requestId = createRequestId();

  try {
    const context = await requireStaffOrAdmin(request);
    const { loanId } = await params;
    const detail = await getStaffInspectionDetail(context, loanId);

    if (!detail) {
      throw new AuthError({
        status: 404,
        code: "INSPECTION_NOT_FOUND",
        message: "Data inspeksi untuk peminjaman ini belum ada atau tidak ditemukan.",
      });
    }

    return jsonSuccess(detail, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

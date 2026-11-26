import type { ApiErrorCode, ApiErrorDetail, ApiErrorResponse } from "@/lib/api/types";

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Sesi login tidak valid atau telah berakhir. Silakan login kembali.",
  FORBIDDEN: "Anda tidak memiliki izin untuk mengakses fitur ini.",
  ACCOUNT_NOT_ACTIVE: "Akun Anda belum aktif atau sedang dinonaktifkan.",
  KOMTING_ASSIGNMENT_REQUIRED: "Penugasan komting aktif diperlukan untuk melakukan aksi ini.",
  APPLICATION_ALREADY_EXISTS: "Pengajuan komting aktif sudah terdaftar.",
  CLASS_ALREADY_HAS_ACTIVE_KOMTING: "Kelas ini sudah memiliki komting aktif.",
  STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT: "Mahasiswa sudah memiliki penugasan komting aktif.",
  PROJECTOR_NOT_FOUND: "Unit proyektor tidak ditemukan.",
  PROJECTOR_NOT_BOOKABLE: "Unit proyektor saat ini tidak dapat dibooking.",
  BOOKING_DATE_INVALID: "Tanggal booking hanya diperbolehkan untuk hari ini atau besok.",
  BOOKING_TIME_IN_PAST: "Waktu booking yang dipilih sudah terlewat.",
  BOOKING_TIME_INVALID: "Rentang waktu booking tidak valid.",
  BOOKING_OUTSIDE_OPERATING_HOURS: "Waktu booking berada di luar jam operasional layanan.",
  ACTIVE_BOOKING_EXISTS: "Anda masih memiliki booking aktif.",
  ACTIVE_LOAN_EXISTS: "Anda masih memiliki peminjaman proyektor yang belum dikembalikan.",
  BOOKING_CONFLICT: "Jadwal proyektor bertabrakan atau unit tidak tersedia.",
  BOOKING_NOT_PICKUP_ELIGIBLE: "Saat ini berada di luar jendela waktu pengambilan.",
  BOOKING_EXPIRED: "Booking telah kedaluwarsa karena melewati batas pengambilan.",
  QR_INVALID: "Token QR tidak valid.",
  QR_EXPIRED: "Token QR telah kedaluwarsa.",
  QR_ACTION_MISMATCH: "QR tidak sesuai dengan aksi transaksi yang dipilih.",
  LOAN_NOT_ACTIVE: "Transaksi peminjaman ini sudah tidak aktif.",
  RETURN_INSPECTION_REQUIRED: "Data pemeriksaan pengembalian belum lengkap.",
  RETURN_EVIDENCE_REQUIRED: "Foto bukti wajib diunggah untuk kondisi rusak atau tidak lengkap.",
  PROJECTOR_HAS_ACTIVE_LOAN: "Unit proyektor masih berstatus dipinjam.",
  OPERATING_HOURS_CONFLICT: "Perubahan jam operasional bertabrakan dengan booking aktif.",
  IDEMPOTENCY_KEY_REUSED: "Permintaan duplikat terdeteksi dengan data yang berbeda.",
  NETWORK_ERROR: "Gagal terhubung ke server. Periksa koneksi jaringan Anda.",
  TIMEOUT: "Permintaan melebihi batas waktu. Muat ulang data sebelum mencoba lagi.",
  INVALID_RESPONSE: "Respons server tidak sesuai format yang diharapkan.",
  UNKNOWN_ERROR: "Terjadi kesalahan yang tidak terduga. Silakan coba lagi.",
};

export function getSafeErrorMessage(code: ApiErrorCode, fallback?: string): string {
  return ERROR_MESSAGES[code] ?? fallback ?? ERROR_MESSAGES.UNKNOWN_ERROR ?? "Terjadi kesalahan.";
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode;
  public readonly details: ApiErrorDetail[];
  public readonly requestId?: string;

  constructor(params: {
    status: number;
    code: ApiErrorCode;
    message?: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  }) {
    const safeMessage = getSafeErrorMessage(params.code, params.message);
    super(safeMessage);
    this.name = "ApiClientError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details ?? [];
    this.requestId = params.requestId;
  }

  /**
   * Maps field-level details from API Contract into a Record<field, reason>.
   */
  public getFieldErrors(): Record<string, string> {
    const mapped: Record<string, string> = {};
    for (const item of this.details) {
      if (item.field) {
        mapped[item.field] = item.reason;
      }
    }
    return mapped;
  }
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApiErrorResponse>;
  return Boolean(
    candidate.error &&
    typeof candidate.error === "object" &&
    typeof candidate.error.code === "string"
  );
}

export function normalizeUnknownError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiClientError({
      status: 0,
      code: "TIMEOUT",
    });
  }

  if (error instanceof TypeError) {
    return new ApiClientError({
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  return new ApiClientError({
    status: 500,
    code: "UNKNOWN_ERROR",
  });
}

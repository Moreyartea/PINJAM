import type { ApiErrorCode, ApiErrorDetail } from "@/lib/api/types";
import { jsonError } from "@/lib/http/response";
import type { NextResponse } from "next/server";
import type { ApiErrorResponse } from "@/lib/api/types";

export class AuthError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode;
  public readonly details: ApiErrorDetail[] | undefined;

  constructor(params: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  }) {
    super(params.message);
    this.name = "AuthError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
  }
}

export function toSafeAuthErrorResponse(
  error: unknown,
  requestId?: string
): NextResponse<ApiErrorResponse> {
  if (error instanceof AuthError) {
    return jsonError({
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
      requestId,
    });
  }

  return jsonError({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Terjadi kesalahan internal saat memproses autentikasi.",
    requestId,
  });
}

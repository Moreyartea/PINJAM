import { NextResponse } from "next/server";
import type {
  ApiErrorDetail,
  ApiErrorResponse,
  ApiListResponse,
  ApiSingleResponse,
  PaginationMeta,
} from "@/lib/api/types";
import type { ApiErrorCode } from "@/lib/api/types";

export function createRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

export function jsonSuccess<T>(
  data: T,
  options: { status?: number; requestId?: string } = {}
): NextResponse<ApiSingleResponse<T>> {
  const status = options.status ?? 200;
  const requestId = options.requestId ?? createRequestId();

  return NextResponse.json(
    {
      data,
      meta: {
        request_id: requestId,
      },
    },
    { status }
  );
}

export function jsonList<T>(
  data: T[],
  pagination: PaginationMeta,
  options: { status?: number; requestId?: string } = {}
): NextResponse<ApiListResponse<T>> {
  const status = options.status ?? 200;
  const requestId = options.requestId ?? createRequestId();

  return NextResponse.json(
    {
      data,
      meta: {
        request_id: requestId,
        pagination,
      },
    },
    { status }
  );
}

export function jsonError(params: {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetail[];
  requestId?: string;
}): NextResponse<ApiErrorResponse> {
  const requestId = params.requestId ?? createRequestId();

  return NextResponse.json(
    {
      error: {
        code: params.code,
        message: params.message,
        ...(params.details && params.details.length > 0 ? { details: params.details } : {}),
      },
      meta: {
        request_id: requestId,
      },
    },
    { status: params.status }
  );
}

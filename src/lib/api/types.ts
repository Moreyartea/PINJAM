/**
 * API Contract envelope, pagination, and error code types.
 * Reference: API_CONTRACT_PINJAM.md Sections 2 and 15.
 */

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export interface ApiMeta {
  request_id: string;
}

export interface ApiListMeta extends ApiMeta {
  pagination: PaginationMeta;
}

export interface ApiSingleResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: ApiListMeta;
}

export interface ApiActionResult {
  success: boolean;
}

export interface ApiErrorDetail {
  field: string;
  reason: string;
}

export type ContractErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "ACCOUNT_NOT_ACTIVE"
  | "KOMTING_ASSIGNMENT_REQUIRED"
  | "APPLICATION_ALREADY_EXISTS"
  | "CLASS_ALREADY_HAS_ACTIVE_KOMTING"
  | "STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT"
  | "PROJECTOR_NOT_FOUND"
  | "PROJECTOR_NOT_BOOKABLE"
  | "BOOKING_DATE_INVALID"
  | "BOOKING_TIME_IN_PAST"
  | "BOOKING_TIME_INVALID"
  | "BOOKING_OUTSIDE_OPERATING_HOURS"
  | "ACTIVE_BOOKING_EXISTS"
  | "ACTIVE_LOAN_EXISTS"
  | "BOOKING_CONFLICT"
  | "BOOKING_NOT_PICKUP_ELIGIBLE"
  | "BOOKING_EXPIRED"
  | "QR_INVALID"
  | "QR_EXPIRED"
  | "QR_ACTION_MISMATCH"
  | "LOAN_NOT_ACTIVE"
  | "RETURN_INSPECTION_REQUIRED"
  | "RETURN_EVIDENCE_REQUIRED"
  | "PROJECTOR_HAS_ACTIVE_LOAN"
  | "OPERATING_HOURS_CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED";

export type ClientFallbackErrorCode =
  "NETWORK_ERROR" | "TIMEOUT" | "INVALID_RESPONSE" | "UNKNOWN_ERROR";

export type ApiErrorCode = ContractErrorCode | ClientFallbackErrorCode | (string & {});

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetail[];
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
  meta?: ApiMeta;
}

export interface ListQueryParams {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

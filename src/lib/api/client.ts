import { ApiClientError, isApiErrorResponse, normalizeUnknownError } from "@/lib/api/errors";
import type { ApiErrorCode } from "@/lib/api/types";
import { env } from "@/lib/config/env";

const API_VERSION_PREFIX = "/api/v1";
const DEFAULT_TIMEOUT_MS = 15000;

export type AccessTokenProvider = () => Promise<string | null> | string | null;

let tokenProvider: AccessTokenProvider | null = null;

/**
 * Registers the active auth session token provider (configured in auth layer).
 */
export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  tokenProvider = provider;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: object;
  body?: unknown;
  formData?: FormData;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: object): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = `${env.apiBaseUrl}${API_VERSION_PREFIX}${normalizedPath}`;

  if (!query) return base;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      if (value !== "") {
        searchParams.set(key, String(value));
      }
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

function fallbackCodeFromStatus(status: number): ApiErrorCode {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  return "UNKNOWN_ERROR";
}

/**
 * Centralized HTTP client enforcing PINJAM API Contract conventions:
 * - /api/v1 prefix from environment base URL
 * - Bearer authorization header from registered token provider
 * - Idempotency-Key support
 * - FormData uploads without manually forcing Content-Type
 * - Normalized ApiClientError handling
 */
export async function apiRequest<TResponse>(
  path: string,
  options: RequestOptions = {}
): Promise<TResponse> {
  const {
    method = "GET",
    query,
    body,
    formData,
    idempotencyKey,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  } = options;

  const url = buildUrl(path, query);
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");

  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  if (idempotencyKey) {
    requestHeaders.set("Idempotency-Key", idempotencyKey);
  }

  let requestBody: BodyInit | undefined;
  if (formData) {
    // Per API Contract §17: let the browser set multipart/form-data boundary automatically.
    requestBody = formData;
  } else if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
    });

    if (response.status === 204) {
      return undefined as TResponse;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const parsed: unknown = isJson ? await response.json().catch(() => null) : null;

    if (!response.ok) {
      if (isApiErrorResponse(parsed)) {
        throw new ApiClientError({
          status: response.status,
          code: parsed.error.code,
          message: parsed.error.message,
          details: parsed.error.details,
          requestId: parsed.meta?.request_id,
        });
      }

      throw new ApiClientError({
        status: response.status,
        code: fallbackCodeFromStatus(response.status),
      });
    }

    if (parsed === null) {
      throw new ApiClientError({
        status: response.status,
        code: "INVALID_RESPONSE",
      });
    }

    return parsed as TResponse;
  } catch (error) {
    throw normalizeUnknownError(error);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

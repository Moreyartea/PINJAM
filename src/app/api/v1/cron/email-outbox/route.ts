import crypto from "node:crypto";
import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { requireRole } from "@/lib/auth/guards";
import { getCronSecret } from "@/lib/config/server-env";
import { getOutboxQueueSummary, processOutboxBatch } from "@/lib/email/outbox-service";
import { createRequestId, jsonSuccess } from "@/lib/http/response";

function safeCompareSecret(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const bufProvided = Buffer.from(provided);
  const bufExpected = Buffer.from(expected);
  if (bufProvided.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

/**
 * Validates caller authorization:
 * Either Vercel Cron header / Authorization Bearer matching CRON_SECRET,
 * OR an authenticated ADMIN user context.
 */
async function authorizeWorkerRequest(request: Request): Promise<void> {
  const configuredSecret = getCronSecret();
  const authHeader = request.headers.get("Authorization") ?? "";
  const cronSecretHeader = request.headers.get("x-cron-secret") ?? "";

  // 1. Check CRON_SECRET matching with constant-time equality
  if (configuredSecret) {
    if (cronSecretHeader && safeCompareSecret(cronSecretHeader, configuredSecret)) {
      return;
    }

    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token && safeCompareSecret(token, configuredSecret)) {
        return;
      }
    }
  }

  // 2. Check ADMIN user session/bearer only if request provides JWT bearer or cookie session
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const isJwt = token.split(".").length === 3;

  if (isJwt || cookieHeader.length > 0) {
    try {
      const context = await requireRole(["ADMIN"], request);
      if (context.user.role === "ADMIN" && context.user.account_status === "ACTIVE") {
        return;
      }
    } catch {
      // Context check threw AuthError or missing auth
    }
  }

  throw new AuthError({
    status: 401,
    code: "AUTH_REQUIRED",
    message: "Akses tidak diizinkan. Kredensial cron atau role ADMIN diperlukan.",
  });
}

export interface CronRouteDeps {
  processOutboxBatch?: typeof processOutboxBatch;
  getOutboxQueueSummary?: typeof getOutboxQueueSummary;
}

export async function handleGet(request: Request, deps: CronRouteDeps = {}) {
  const requestId = createRequestId();

  try {
    await authorizeWorkerRequest(request);
    const getter = deps.getOutboxQueueSummary ?? getOutboxQueueSummary;
    const summary = await getter();
    return jsonSuccess(summary, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

export async function handlePost(request: Request, deps: CronRouteDeps = {}) {
  const requestId = createRequestId();

  try {
    await authorizeWorkerRequest(request);

    let batchSize: number | undefined;
    let maxAttempts: number | undefined;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      if (typeof body.batch_size === "number") batchSize = body.batch_size;
      if (typeof body.max_attempts === "number") maxAttempts = body.max_attempts;
    }

    const url = new URL(request.url);
    const qBatch = url.searchParams.get("batch_size");
    const qAttempts = url.searchParams.get("max_attempts");
    if (qBatch && !batchSize) batchSize = parseInt(qBatch, 10);
    if (qAttempts && !maxAttempts) maxAttempts = parseInt(qAttempts, 10);

    const runner = deps.processOutboxBatch ?? processOutboxBatch;
    const summary = await runner({
      batchSize,
      maxAttempts,
    });

    return jsonSuccess(summary, { requestId });
  } catch (error) {
    return toSafeAuthErrorResponse(error, requestId);
  }
}

/**
 * GET /api/v1/cron/email-outbox
 * Returns current outbox queue status and health summary.
 */
export async function GET(request: Request) {
  return handleGet(request);
}

/**
 * POST /api/v1/cron/email-outbox
 * Triggers batch processing of transactional email outbox events.
 */
export async function POST(request: Request) {
  return handlePost(request);
}

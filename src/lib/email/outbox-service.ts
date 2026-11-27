import { getEmailProvider } from "@/lib/email/provider-factory";
import { renderEmail } from "@/lib/email/templates";
import type { EmailProvider, OutboxItem } from "@/lib/email/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProcessOutboxOptions {
  adminClient?: SupabaseClient<Database>;
  provider?: EmailProvider;
  batchSize?: number;
  lockTimeoutSeconds?: number;
  maxAttempts?: number;
  now?: Date;
}

export interface OutboxProcessSummary {
  claimed: number;
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  durationMs: number;
}

export interface OutboxQueueSummary {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  total: number;
}

/**
 * Calculates exponential backoff in milliseconds.
 * Formula: 2^(attempt - 1) minutes (e.g. 1m, 2m, 4m, 8m, 16m...)
 */
export function calculateBackoffMs(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount - 1);
  const minutes = Math.pow(2, exponent);
  return minutes * 60 * 1000;
}

/**
 * Claims a batch of outbox events ready for processing using RPC rpc_claim_email_outbox_batch.
 * If the RPC is not available (e.g. during offline unit tests with mock client),
 * falls back to direct select & update.
 */
export async function claimOutboxBatch(
  client: SupabaseClient<Database>,
  batchSize = 10,
  lockTimeoutSeconds = 300,
  now = new Date()
): Promise<OutboxItem[]> {
  const safeLimit = Math.max(1, Math.min(batchSize, 50));

  // 1. Try atomic database RPC (FOR UPDATE SKIP LOCKED)
  const { data: rpcData, error: rpcError } = await client.rpc(
    "rpc_claim_email_outbox_batch" as keyof Database["public"]["Functions"],
    {
      p_batch_size: safeLimit,
      p_lock_timeout_seconds: lockTimeoutSeconds,
    } as unknown as Record<string, unknown>
  );

  if (!rpcError && Array.isArray(rpcData)) {
    return rpcData as unknown as OutboxItem[];
  }

  // 2. Fallback for test/mock environment without RPC
  const timeoutThreshold = new Date(now.getTime() - lockTimeoutSeconds * 1000).toISOString();
  const nowIso = now.toISOString();

  // Query pending or stale processing items
  const { data: candidates, error: selectErr } = await client
    .from("email_outbox")
    .select("*")
    .or(
      `status.eq.PENDING,and(status.eq.PROCESSING,locked_at.is.null),and(status.eq.PROCESSING,locked_at.lt.${timeoutThreshold})`
    )
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (selectErr || !candidates || candidates.length === 0) {
    return [];
  }

  const claimed: OutboxItem[] = [];

  for (const item of candidates as unknown as OutboxItem[]) {
    const nextAttempts =
      item.status === "PENDING" ? (item.attempt_count || 0) + 1 : item.attempt_count || 1;
    const { data: updated, error: updateErr } = await client
      .from("email_outbox")
      .update({
        status: "PROCESSING",
        locked_at: nowIso,
        attempt_count: nextAttempts,
        updated_at: nowIso,
      })
      .eq("id", item.id)
      .select("*")
      .single();

    if (!updateErr && updated) {
      claimed.push(updated as unknown as OutboxItem);
    }
  }

  return claimed;
}

/**
 * Processes a batch of transactional outbox events.
 * Guarantees idempotency, respects retry limits, handles non-retryable errors,
 * and maintains database audit and outbox state.
 */
export async function processOutboxBatch(
  options: ProcessOutboxOptions = {}
): Promise<OutboxProcessSummary> {
  const startTime = Date.now();
  const client = options.adminClient ?? createSupabaseAdminClient();
  const provider = options.provider ?? getEmailProvider();
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 10, 50));
  const lockTimeoutSeconds = options.lockTimeoutSeconds ?? 300;
  const maxAttempts = options.maxAttempts ?? 5;
  const now = options.now ?? new Date();

  const claimedItems = await claimOutboxBatch(client, batchSize, lockTimeoutSeconds, now);

  let sentCount = 0;
  let failedCount = 0;
  let retriedCount = 0;

  for (const item of claimedItems) {
    const currentNow = new Date();
    const currentNowIso = currentNow.toISOString();

    // Anti-replay guard: If item was already marked SENT, skip sending again
    if (item.status === "SENT") {
      continue;
    }

    // 1. Template Rendering Phase
    let rendered;
    try {
      rendered = renderEmail(item.event_type, item.payload);
    } catch (templateErr) {
      // Unrecoverable template error (e.g. unknown event type or invalid payload)
      const errorMsg = templateErr instanceof Error ? templateErr.message : String(templateErr);
      await client
        .from("email_outbox")
        .update({
          status: "FAILED",
          locked_at: null,
          last_error: `Template Error: ${errorMsg}`,
          updated_at: currentNowIso,
        })
        .eq("id", item.id);

      failedCount += 1;
      continue;
    }

    // 2. Email Provider Dispatch Phase
    let sendResult;
    try {
      sendResult = await provider.sendEmail({
        to: item.recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: item.deduplication_key,
        metadata: {
          outbox_id: item.id,
          event_type: item.event_type,
          attempt: item.attempt_count,
        },
      });
    } catch (providerErr) {
      const errorMsg = providerErr instanceof Error ? providerErr.message : String(providerErr);
      sendResult = {
        success: false,
        error: `Provider Exception: ${errorMsg}`,
        retryable: true,
      };
    }

    // 3. State Transition Phase
    if (sendResult.success) {
      const { error: updateErr } = await client
        .from("email_outbox")
        .update({
          status: "SENT",
          sent_at: currentNowIso,
          locked_at: null,
          last_error: null,
          updated_at: currentNowIso,
        })
        .eq("id", item.id);

      if (updateErr) {
        // If DB update failed, the item remains in PROCESSING until lock expires,
        // so a subsequent run will safely replay via idempotencyKey without duplicating delivery.
        failedCount += 1;
      } else {
        sentCount += 1;
      }
    } else {
      const isRetryable = sendResult.retryable !== false;
      const willRetry = isRetryable && item.attempt_count < maxAttempts;

      if (willRetry) {
        const backoffMs = calculateBackoffMs(item.attempt_count);
        const nextAttemptTime = new Date(currentNow.getTime() + backoffMs).toISOString();

        await client
          .from("email_outbox")
          .update({
            status: "PENDING",
            next_attempt_at: nextAttemptTime,
            locked_at: null,
            last_error: sendResult.error || "Email delivery failed; scheduled for retry.",
            updated_at: currentNowIso,
          })
          .eq("id", item.id);

        retriedCount += 1;
      } else {
        await client
          .from("email_outbox")
          .update({
            status: "FAILED",
            locked_at: null,
            last_error:
              sendResult.error ||
              (item.attempt_count >= maxAttempts
                ? `Max attempts (${maxAttempts}) reached.`
                : "Non-retryable provider error."),
            updated_at: currentNowIso,
          })
          .eq("id", item.id);

        failedCount += 1;
      }
    }
  }

  return {
    claimed: claimedItems.length,
    processed: claimedItems.length,
    sent: sentCount,
    failed: failedCount,
    retried: retriedCount,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Retrieves aggregate queue summary for monitoring outbox health.
 */
export async function getOutboxQueueSummary(
  client?: SupabaseClient<Database>
): Promise<OutboxQueueSummary> {
  const admin = client ?? createSupabaseAdminClient();

  const [pendingRes, processingRes, sentRes, failedRes] = await Promise.all([
    admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    admin
      .from("email_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "PROCESSING"),
    admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "SENT"),
    admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "FAILED"),
  ]);

  const pending = pendingRes.count ?? 0;
  const processing = processingRes.count ?? 0;
  const sent = sentRes.count ?? 0;
  const failed = failedRes.count ?? 0;

  return {
    pending,
    processing,
    sent,
    failed,
    total: pending + processing + sent + failed,
  };
}

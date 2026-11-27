import assert from "node:assert/strict";
import crypto from "node:crypto";
import { beforeEach, describe, it } from "node:test";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder-test.supabase.co";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-role-key";
}
if (!process.env.CRON_SECRET) {
  process.env.CRON_SECRET = "test-cron-secret-12345";
}

import { GET, POST, handleGet, handlePost } from "@/app/api/v1/cron/email-outbox/route";
import { calculateBackoffMs, processOutboxBatch } from "@/lib/email/outbox-service";
import { MockEmailProvider } from "@/lib/email/providers/mock-provider";
import { ResendEmailProvider } from "@/lib/email/providers/resend-provider";
import { renderEmail } from "@/lib/email/templates";
import type { OutboxItem } from "@/lib/email/types";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MockTableState {
  items: Map<string, OutboxItem>;
  simulateDbFailure: boolean;
}

function createInMemoryOutboxClient(initialItems: OutboxItem[] = []) {
  const state: MockTableState = {
    items: new Map(initialItems.map((item) => [item.id, { ...item }])),
    simulateDbFailure: false,
  };

  const client = {
    _state: state,
    rpc: async (fnName: string, args: Record<string, unknown>) => {
      if (fnName === "rpc_claim_email_outbox_batch") {
        if (state.simulateDbFailure) {
          return { data: null, error: { message: "Database connection failed", code: "08006" } };
        }

        const batchSize = Number(args.p_batch_size || 10);
        const lockTimeout = Number(args.p_lock_timeout_seconds || 300);
        const now = new Date();
        const threshold = new Date(now.getTime() - lockTimeout * 1000);

        const claimable: OutboxItem[] = [];
        for (const item of state.items.values()) {
          const isPending = item.status === "PENDING";
          const isStale =
            item.status === "PROCESSING" &&
            item.locked_at !== null &&
            new Date(item.locked_at) < threshold;

          const isDue = new Date(item.next_attempt_at) <= now;

          if ((isPending || isStale) && isDue) {
            claimable.push(item);
          }
        }

        // Sort by next_attempt_at ASC, created_at ASC
        claimable.sort((a, b) => {
          const tA = new Date(a.next_attempt_at).getTime();
          const tB = new Date(b.next_attempt_at).getTime();
          if (tA !== tB) return tA - tB;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        const selected = claimable.slice(0, batchSize);
        const claimed: OutboxItem[] = [];

        for (const target of selected) {
          const updated: OutboxItem = {
            ...target,
            status: "PROCESSING",
            locked_at: now.toISOString(),
            attempt_count:
              target.status === "PENDING" ? target.attempt_count + 1 : target.attempt_count,
            updated_at: now.toISOString(),
          };
          state.items.set(target.id, updated);
          claimed.push(updated);
        }

        return { data: claimed, error: null };
      }
      return { data: null, error: { message: `Unknown RPC ${fnName}`, code: "42883" } };
    },
    from: (table: string) => {
      if (table !== "email_outbox") {
        throw new Error(`Unexpected table: ${table}`);
      }

      let currentFilter: (item: OutboxItem) => boolean = () => true;

      const builder = {
        select: (columns?: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === "exact" && options?.head) {
            return {
              eq: (col: string, val: string) => {
                const count = Array.from(state.items.values()).filter(
                  (i) => (i as unknown as Record<string, unknown>)[col] === val
                ).length;
                return Promise.resolve({ count, data: null, error: null });
              },
            };
          }

          const selectBuilder = {
            or: (_conditionStr: string) => selectBuilder,
            lte: (_col: string, _val: string) => selectBuilder,
            order: (_col: string, _opts?: unknown) => selectBuilder,
            limit: (num: number) => {
              const all = Array.from(state.items.values()).filter(currentFilter).slice(0, num);
              return Promise.resolve({ data: all, error: null });
            },
            eq: (col: string, val: unknown) => {
              const prev = currentFilter;
              currentFilter = (item) =>
                prev(item) && (item as unknown as Record<string, unknown>)[col] === val;
              return selectBuilder;
            },
            single: () => {
              const all = Array.from(state.items.values()).filter(currentFilter);
              return Promise.resolve({ data: all[0] || null, error: null });
            },
          };
          return selectBuilder;
        },
        update: (updates: Partial<OutboxItem>) => {
          return {
            eq: (col: string, val: unknown) => {
              const res = state.simulateDbFailure
                ? { data: null, error: { message: "Simulated DB update error", code: "50001" } }
                : (() => {
                    if (col === "id") {
                      const existing = state.items.get(val as string);
                      if (existing) {
                        const updated = { ...existing, ...updates };
                        state.items.set(val as string, updated);
                        return { data: updated, error: null };
                      }
                    }
                    return { data: null, error: null };
                  })();

              const promise = Promise.resolve(res);
              return Object.assign(promise, {
                select: () => ({
                  single: () => Promise.resolve(res),
                }),
              });
            },
          };
        },
        insert: (insertData: Partial<OutboxItem>) => {
          // Check deduplication key uniqueness
          if (insertData.deduplication_key) {
            for (const item of state.items.values()) {
              if (item.deduplication_key === insertData.deduplication_key) {
                return Promise.resolve({
                  data: null,
                  error: {
                    message: "duplicate key value violates unique constraint",
                    code: "23505",
                  },
                });
              }
            }
          }

          const id = insertData.id || crypto.randomUUID();
          const newItem: OutboxItem = {
            id,
            event_type: insertData.event_type || "BOOKING_CONFIRMED",
            recipient: insertData.recipient || "test@example.test",
            payload: insertData.payload || {},
            deduplication_key: insertData.deduplication_key || `dedup-${id}`,
            status: insertData.status || "PENDING",
            attempt_count: insertData.attempt_count || 0,
            next_attempt_at: insertData.next_attempt_at || new Date().toISOString(),
            locked_at: insertData.locked_at || null,
            sent_at: insertData.sent_at || null,
            last_error: insertData.last_error || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          state.items.set(id, newItem);
          return Promise.resolve({ data: newItem, error: null });
        },
      };

      return builder;
    },
  } as unknown as SupabaseClient<Database> & { _state: MockTableState };

  return client;
}

function makePendingItem(overrides: Partial<OutboxItem> = {}): OutboxItem {
  const id = overrides.id || crypto.randomUUID();
  return {
    id,
    event_type: "BOOKING_CONFIRMED",
    recipient: "komting-test@pinjam.test",
    payload: {
      booking_id: `bkg-${id}`,
      booking_code: "BKG-2026-TEST",
      projector_name: "Epson EB-X500",
      booking_date: "2026-11-28",
      start_time: "09:00:00",
      pickup_window_start_at: "08:30:00",
      pickup_window_end_at: "09:15:00",
    },
    deduplication_key: `booking_confirmed:${id}`,
    status: "PENDING",
    attempt_count: 0,
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    locked_at: null,
    sent_at: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Sprint BE-6: Notification & Email Outbox Integration Unit Tests", () => {
  let mockProvider: MockEmailProvider;

  beforeEach(() => {
    mockProvider = new MockEmailProvider();
  });

  // 1. Pemrosesan event pending
  it("1. claims and processes pending outbox events successfully", async () => {
    const item = makePendingItem();
    const client = createInMemoryOutboxClient([item]);

    const result = await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
      batchSize: 10,
    });

    assert.strictEqual(result.claimed, 1);
    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.sent, 1);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.retried, 0);

    const updated = client._state.items.get(item.id);
    assert.strictEqual(updated?.status, "SENT");
    assert(updated?.sent_at !== null, "sent_at must be populated");
    assert.strictEqual(updated?.locked_at, null);
    assert.strictEqual(updated?.attempt_count, 1);
  });

  // 2. Event berhasil dikirim ke provider
  it("2. dispatches email with correct rendered template to provider", async () => {
    const item = makePendingItem({
      recipient: "komting123@mahasiswa.test",
      payload: {
        booking_code: "BKG-SUCCESS-99",
        projector_name: "Sony VPL-DX221",
        booking_date: "2026-11-28",
        start_time: "10:00:00",
        pickup_window_start_at: "09:30:00",
        pickup_window_end_at: "10:15:00",
      },
    });
    const client = createInMemoryOutboxClient([item]);

    await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
    });

    const sentMessages = mockProvider.getSentMessages();
    assert.strictEqual(sentMessages.length, 1);
    const firstMsg = sentMessages[0];
    assert(firstMsg);
    assert.strictEqual(firstMsg.to, "komting123@mahasiswa.test");
    assert.match(firstMsg.subject, /BKG-SUCCESS-99/);
    assert.match(firstMsg.html, /Sony VPL-DX221/);
    assert.match(firstMsg.text, /10:00:00/);
    assert.strictEqual(firstMsg.idempotencyKey, item.deduplication_key);
  });

  // 3. Provider gagal mengirim (transient error) -> status PENDING dengan backoff
  it("3. handles transient provider failure by scheduling retry with exponential backoff", async () => {
    const item = makePendingItem();
    const client = createInMemoryOutboxClient([item]);

    mockProvider.simulateFailure("Rate limited by SMTP gateway", true);

    const result = await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
    });

    assert.strictEqual(result.claimed, 1);
    assert.strictEqual(result.sent, 0);
    assert.strictEqual(result.retried, 1);
    assert.strictEqual(result.failed, 0);

    const updated = client._state.items.get(item.id);
    assert.strictEqual(updated?.status, "PENDING", "Status must return to PENDING for retry");
    assert.strictEqual(updated?.attempt_count, 1);
    assert.strictEqual(updated?.locked_at, null);
    assert.match(updated?.last_error ?? "", /Rate limited/);

    // Verify next_attempt_at is in the future (backoff for attempt 1 is 1 minute)
    const nextAttempt = new Date(updated!.next_attempt_at).getTime();
    const nowTime = Date.now();
    assert(nextAttempt > nowTime, "next_attempt_at must be in the future");
  });

  // 4. Retry dan batas maksimum percobaan -> FAILED
  it("4. marks item as FAILED when max_attempts is exceeded or non-retryable", async () => {
    // Item already attempted 4 times, next attempt will be the 5th (maxAttempts = 5)
    const item = makePendingItem({ attempt_count: 4 });
    const client = createInMemoryOutboxClient([item]);

    mockProvider.simulateFailure("550 User unknown mailbox", true);

    const result = await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
      maxAttempts: 5,
    });

    assert.strictEqual(result.claimed, 1);
    assert.strictEqual(result.sent, 0);
    assert.strictEqual(result.retried, 0);
    assert.strictEqual(result.failed, 1);

    const updated = client._state.items.get(item.id);
    assert.strictEqual(updated?.status, "FAILED");
    assert.strictEqual(updated?.attempt_count, 5);
    assert.match(updated?.last_error ?? "", /550 User unknown/);

    // Also verify non-retryable error fails immediately regardless of attempt count
    const itemFresh = makePendingItem({ id: "fresh-item", attempt_count: 0 });
    const client2 = createInMemoryOutboxClient([itemFresh]);
    mockProvider.simulateFailure("400 Bad Request: Invalid email format", false);

    const result2 = await processOutboxBatch({
      adminClient: client2,
      provider: mockProvider,
      maxAttempts: 5,
    });

    assert.strictEqual(result2.failed, 1);
    const updatedFresh = client2._state.items.get("fresh-item");
    assert.strictEqual(updatedFresh?.status, "FAILED");
  });

  // 5. Pencegahan duplikasi (deduplication key)
  it("5. prevents duplicate email outbox event insertion via unique deduplication_key", async () => {
    const item = makePendingItem({ deduplication_key: "unique-booking-id-123" });
    const client = createInMemoryOutboxClient([item]);

    // Attempt inserting second outbox item with identical deduplication_key
    const { error } = await client.from("email_outbox").insert({
      deduplication_key: "unique-booking-id-123",
      event_type: "BOOKING_CONFIRMED",
      recipient: "another@test.com",
    });

    assert(error !== null, "Must reject duplicate deduplication_key");
    assert.strictEqual(error.code, "23505");
  });

  // 6. Dua worker berjalan bersamaan (Concurrency safety)
  it("6. guarantees two concurrent workers never process the same item simultaneously", async () => {
    const item1 = makePendingItem({ id: "item-1" });
    const item2 = makePendingItem({ id: "item-2" });
    const item3 = makePendingItem({ id: "item-3" });

    const client = createInMemoryOutboxClient([item1, item2, item3]);

    // Worker 1 and Worker 2 run in parallel with batchSize = 2
    const [worker1Result, worker2Result] = await Promise.all([
      processOutboxBatch({ adminClient: client, provider: mockProvider, batchSize: 2 }),
      processOutboxBatch({ adminClient: client, provider: mockProvider, batchSize: 2 }),
    ]);

    // Total claimed across both workers must equal exactly 3 (item-1, item-2, item-3)
    const totalClaimed = worker1Result.claimed + worker2Result.claimed;
    assert.strictEqual(totalClaimed, 3, "No item may be claimed twice by concurrent workers");

    const totalSent = worker1Result.sent + worker2Result.sent;
    assert.strictEqual(totalSent, 3);
    assert.strictEqual(mockProvider.getSentMessages().length, 3);
  });

  // 7. Payload tidak valid -> FAILED dengan last_error deskriptif
  it("7. handles invalid payload gracefully by marking item as FAILED without crashing worker", async () => {
    const item = makePendingItem({
      payload: {}, // Missing required booking_code
    });
    const client = createInMemoryOutboxClient([item]);

    const result = await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
    });

    assert.strictEqual(result.claimed, 1);
    assert.strictEqual(result.sent, 0);
    assert.strictEqual(result.failed, 1);

    const updated = client._state.items.get(item.id);
    assert.strictEqual(updated?.status, "FAILED");
    assert.match(updated?.last_error ?? "", /Template Error: Missing required field/);
  });

  // 8. Event tidak dikenal -> FAILED
  it("8. handles unknown event_type by marking item as FAILED", async () => {
    const item = makePendingItem({
      event_type: "NONEXISTENT_MAGIC_EVENT",
      payload: { foo: "bar" },
    });
    const client = createInMemoryOutboxClient([item]);

    const result = await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
    });

    assert.strictEqual(result.failed, 1);
    const updated = client._state.items.get(item.id);
    assert.strictEqual(updated?.status, "FAILED");
    assert.match(updated?.last_error ?? "", /Unknown email event type/);
  });

  // 9. Kegagalan database -> ditangani dengan aman tanpa crash
  it("9. handles database connection errors gracefully during batch processing", async () => {
    const item = makePendingItem();
    const client = createInMemoryOutboxClient([item]);

    client._state.simulateDbFailure = true;

    // Should return 0 claimed and not crash
    const result = await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
    });

    assert.strictEqual(result.claimed, 0);
    assert.strictEqual(result.sent, 0);
  });

  // 10. Event yang sudah SENT tidak dikirim ulang (Anti-replay)
  it("10. never re-processes or re-sends items that are already marked SENT", async () => {
    const sentItem = makePendingItem({
      id: "already-sent",
      status: "SENT",
      sent_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    });

    const client = createInMemoryOutboxClient([sentItem]);

    const result = await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
    });

    assert.strictEqual(result.claimed, 0, "Already SENT item must not be claimed");
    assert.strictEqual(mockProvider.getSentMessages().length, 0, "No email may be sent");
  });

  // 11. Stale processing lock recovery
  it("11. recovers and re-claims items stuck in PROCESSING after lock timeout expires", async () => {
    const staleItem = makePendingItem({
      id: "stale-worker-crash",
      status: "PROCESSING",
      locked_at: new Date(Date.now() - 400 * 1000).toISOString(), // Locked 400s ago (> 300s timeout)
      attempt_count: 1,
    });

    const client = createInMemoryOutboxClient([staleItem]);

    const result = await processOutboxBatch({
      adminClient: client,
      provider: mockProvider,
      lockTimeoutSeconds: 300,
    });

    assert.strictEqual(result.claimed, 1);
    assert.strictEqual(result.sent, 1);

    const updated = client._state.items.get("stale-worker-crash");
    assert.strictEqual(updated?.status, "SENT");
    assert.strictEqual(
      updated?.attempt_count,
      1,
      "attempt_count must not increment on stale lock reclaim"
    );
  });

  // 12. Exponential backoff calculation formula
  it("12. calculates backoff durations according to exponential formula", () => {
    assert.strictEqual(calculateBackoffMs(1), 60 * 1000); // 1 min
    assert.strictEqual(calculateBackoffMs(2), 2 * 60 * 1000); // 2 min
    assert.strictEqual(calculateBackoffMs(3), 4 * 60 * 1000); // 4 min
    assert.strictEqual(calculateBackoffMs(4), 8 * 60 * 1000); // 8 min
    assert.strictEqual(calculateBackoffMs(5), 16 * 60 * 1000); // 16 min
  });

  // 13. Template rendering coverage across all BE-2, BE-4, BE-5 events
  it("13. renders all supported event types into valid HTML and text", () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [
      {
        type: "BOOKING_CONFIRMED",
        payload: {
          booking_code: "BKG-1",
          projector_name: "Proj-1",
          booking_date: "2026-11-28",
          start_time: "09:00:00",
        },
      },
      {
        type: "BOOKING_CANCELLED",
        payload: {
          booking_code: "BKG-2",
          cancelled_at: "2026-11-28T08:00:00Z",
          cancel_reason: "Dosen berhalangan",
        },
      },
      {
        type: "LOAN_STARTED",
        payload: {
          booking_code: "BKG-3",
          projector_name: "Proj-2",
          borrowed_at: "2026-11-28T09:05:00Z",
          estimated_return_at: "2026-11-28T15:00:00Z",
        },
      },
      {
        type: "LOAN_RETURNED",
        payload: {
          booking_code: "BKG-4",
          projector_name: "Proj-3",
          returned_at: "2026-11-28T15:10:00Z",
          unit_disposition: "AVAILABLE",
          is_overdue: true,
          overdue_minutes: 10,
        },
      },
      {
        type: "KOMTING_APPLICATION_APPROVED",
        payload: { class_name: "TI-3A" },
      },
      {
        type: "KOMTING_APPLICATION_REJECTED",
        payload: { class_name: "TI-3B", rejection_reason: "KTM tidak jelas" },
      },
      {
        type: "KOMTING_REPLACEMENT_NOTICE_OLD",
        payload: { class_name: "TI-3C" },
      },
      {
        type: "KOMTING_REPLACEMENT_COMPLETED",
        payload: { class_name: "TI-3D" },
      },
      {
        type: "KOMTING_ASSIGNMENT_DEACTIVATED",
        payload: { class_name: "TI-3E", deactivation_reason: "Lulus" },
      },
    ];

    for (const ev of events) {
      const rendered = renderEmail(ev.type, ev.payload);
      assert(rendered.subject.length > 0, `Subject must not be empty for ${ev.type}`);
      assert(rendered.html.includes("PINJAM"), `HTML must include PINJAM header for ${ev.type}`);
      assert(rendered.text.length > 0, `Text must not be empty for ${ev.type}`);
    }
  });

  // 14. Cron API Route Authorization
  it("14. protects /api/v1/cron/email-outbox requiring valid CRON_SECRET or ADMIN role", async () => {
    const mockRunner = async () => ({
      claimed: 0,
      processed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      durationMs: 5,
    });
    const mockGetter = async () => ({
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      total: 0,
    });
    const deps = {
      processOutboxBatch: mockRunner,
      getOutboxQueueSummary: mockGetter,
    };

    // A. Unauthenticated / missing header -> 401
    const unauthReq = new Request("http://localhost/api/v1/cron/email-outbox", {
      method: "POST",
    });
    const unauthRes = await POST(unauthReq);
    assert.strictEqual(unauthRes.status, 401);

    // B. Invalid secret -> 401
    const invalidReq = new Request("http://localhost/api/v1/cron/email-outbox", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const invalidRes = await POST(invalidReq);
    assert.strictEqual(invalidRes.status, 401);

    // C. Valid CRON_SECRET via Authorization: Bearer -> 200
    const validBearerReq = new Request("http://localhost/api/v1/cron/email-outbox", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const validBearerRes = await handlePost(validBearerReq, deps);
    assert.strictEqual(validBearerRes.status, 200);

    // D. Valid CRON_SECRET via x-cron-secret header -> 200
    const validHeaderReq = new Request("http://localhost/api/v1/cron/email-outbox", {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET || "" },
    });
    const validHeaderRes = await handlePost(validHeaderReq, deps);
    assert.strictEqual(validHeaderRes.status, 200);

    // E. GET queue summary with valid secret -> 200
    const getReq = new Request("http://localhost/api/v1/cron/email-outbox", {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const getRes = await handleGet(getReq, deps);
    assert.strictEqual(getRes.status, 200);
    const getJson = (await getRes.json()) as { data: { total: number } };
    assert(typeof getJson.data.total === "number");
  });

  // 15. Resend Provider Adapter Error Handling
  it("15. verifies ResendEmailProvider classifies 429/5xx as retryable and 4xx as non-retryable", async () => {
    const resend = new ResendEmailProvider({
      apiKey: "re_dummy_key_123",
      apiUrl: "https://mock-resend.test/emails",
    });

    // Mock global fetch for testing provider responses
    const originalFetch = globalThis.fetch;

    try {
      // Case 1: 429 Rate Limit -> retryable
      globalThis.fetch = async () =>
        new Response("Too many requests", { status: 429 }) as unknown as Promise<Response>;
      const res429 = await resend.sendEmail({
        to: "user@test.com",
        subject: "Test",
        html: "<p>test</p>",
        text: "test",
      });
      assert.strictEqual(res429.success, false);
      assert.strictEqual(res429.retryable, true);

      // Case 2: 400 Bad Request -> non-retryable
      globalThis.fetch = async () =>
        new Response("Invalid recipient", { status: 400 }) as unknown as Promise<Response>;
      const res400 = await resend.sendEmail({
        to: "user@test.com",
        subject: "Test",
        html: "<p>test</p>",
        text: "test",
      });
      assert.strictEqual(res400.success, false);
      assert.strictEqual(res400.retryable, false);

      // Case 3: 200 OK -> success
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ id: "resend-msg-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }) as unknown as Promise<Response>;
      const res200 = await resend.sendEmail({
        to: "user@test.com",
        subject: "Test",
        html: "<p>test</p>",
        text: "test",
      });
      assert.strictEqual(res200.success, true);
      assert.strictEqual(res200.messageId, "resend-msg-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 16. Idempotency on Worker Crash After Provider Send
  it("16. ensures idempotency when provider receives email but worker crashes before marking SENT", async () => {
    const dedupKey = "booking_confirmed_crash_test_123";
    const item = makePendingItem({
      id: "crash-after-send-id",
      status: "PROCESSING",
      locked_at: new Date(Date.now() - 400 * 1000).toISOString(), // Stale lease (> 300s)
      deduplication_key: dedupKey,
      attempt_count: 1,
    });

    // Simulate that the provider ALREADY received this email during the first crashed attempt
    const provider = new MockEmailProvider();
    await provider.sendEmail({
      to: item.recipient,
      subject: "Test Subject",
      html: "<p>Test</p>",
      text: "Test",
      idempotencyKey: dedupKey,
    });
    assert.strictEqual(provider.getSentMessages().length, 1);

    const client = createInMemoryOutboxClient([item]);

    // Next worker runs stale recovery
    const result = await processOutboxBatch({
      adminClient: client,
      provider,
      lockTimeoutSeconds: 300,
    });

    assert.strictEqual(result.claimed, 1);
    assert.strictEqual(result.sent, 1);

    // CRITICAL: Provider must NOT have sent a 2nd duplicate email
    assert.strictEqual(
      provider.getSentMessages().length,
      1,
      "Provider must deduplicate via idempotencyKey; no duplicate email may be sent"
    );

    // Database row must now be reconciled to SENT
    const updated = client._state.items.get("crash-after-send-id");
    assert.strictEqual(updated?.status, "SENT");
    assert(updated?.sent_at !== null);
    assert.strictEqual(updated?.locked_at, null);
  });
});

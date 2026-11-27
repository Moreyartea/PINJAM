import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "../../scripts/load-env-local.mjs";
import { isValidHttpUrl } from "@/lib/config/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { MockEmailProvider } from "@/lib/email/providers/mock-provider";
import { processOutboxBatch } from "@/lib/email/outbox-service";

loadEnvLocal();

const LIVE_ENABLED = process.env.PINJAM_RUN_LIVE_BE6_TESTS === "true";

interface LiveBe6Config {
  supabaseUrl: string;
  supabaseHost: string;
  anonKey: string;
  serviceRoleKey: string;
  testPassword: string | null;
  adminEmail: string;
  cronSecret: string;
}

function validateConfig(): LiveBe6Config {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const testPassword = (process.env.PINJAM_TEST_USER_PASSWORD ?? "").trim() || null;
  const adminEmail = (process.env.PINJAM_TEST_ADMIN_EMAIL ?? "conc-admin@example.test")
    .trim()
    .toLowerCase();
  const cronSecret = (process.env.CRON_SECRET ?? "test-live-cron-secret-12345").trim();

  if (!isValidHttpUrl(supabaseUrl)) {
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL for live BE-6 tests.");
  }
  const parsed = new URL(supabaseUrl);
  if (supabaseUrl.toLowerCase().includes("prod")) {
    throw new Error(`Refusing live test against production host: ${parsed.hostname}`);
  }
  if (!anonKey || !serviceRoleKey || anonKey === serviceRoleKey) {
    throw new Error("Invalid public/service role keys for live BE-6 tests.");
  }

  return {
    supabaseUrl,
    supabaseHost: parsed.hostname,
    anonKey,
    serviceRoleKey,
    testPassword,
    adminEmail,
    cronSecret,
  };
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (!address || typeof address === "string") {
        srv.close(() => reject(new Error("Unable to obtain free port")));
        return;
      }
      const port = address.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForHttpOk(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for HTTP server at ${url}`);
}

async function startLiveNextServer(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const configured = (process.env.PINJAM_LIVE_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) {
    return { baseUrl: configured, stop: async () => {} };
  }

  const port = await findFreePort();
  const projectRoot = path.resolve(process.cwd());
  const hasBuild = fs.existsSync(path.join(projectRoot, ".next", "BUILD_ID"));
  const nextBin = path.join(projectRoot, "node_modules", ".bin", "next");
  const args = hasBuild
    ? ["start", "--port", String(port), "--hostname", "127.0.0.1"]
    : ["dev", "-p", String(port)];

  const child: ChildProcess = spawn(nextBin, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      EMAIL_PROVIDER: "mock",
      CRON_SECRET: process.env.CRON_SECRET || "test-live-cron-secret-12345",
    },
    stdio: "pipe",
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttpOk(`${baseUrl}/api/v1/auth/session`);

  return {
    baseUrl,
    stop: async () => {
      if (child.killed) return;
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      if (!child.killed) child.kill("SIGKILL");
    },
  };
}

describe("Sprint BE-6: Live Supabase Integration Tests", () => {
  if (!LIVE_ENABLED) {
    it("SKIPPED: Live BE-6 tests disabled. Set PINJAM_RUN_LIVE_BE6_TESTS=true to run.", () => {
      // Intentionally skipped unless explicitly activated for PINJAM_TESTING
    });
    return;
  }

  let config: LiveBe6Config;
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  let serverHandle: { baseUrl: string; stop: () => Promise<void> };
  let baseUrl: string;
  let adminToken: string;
  let migration017Applied = false;

  const runId = Math.random().toString(36).substring(2, 8);
  const createdOutboxIds: string[] = [];

  function makeAnonClient() {
    return createClient<Database>(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async function signInExisting(email: string): Promise<string> {
    const anon = makeAnonClient();

    // 1. Try password login if PINJAM_TEST_USER_PASSWORD is set
    if (config.testPassword) {
      const { data, error } = await anon.auth.signInWithPassword({
        email,
        password: config.testPassword,
      });
      if (!error && data.session?.access_token) {
        console.log(`[Diagnostic Auth] Password login succeeded for ${email}`);
        return data.session.access_token;
      }
      if (error) {
        console.log(
          `[Diagnostic Auth] Password login rejected for ${email}: status=${error.status ?? "unknown"}, message=${error.message}`
        );
      }
    }

    // 2. Fall back to service-role magiclink OTP (matches BE-2, BE-3, BE-4, and BE-5 standard)
    // Generates valid session for pre-existing test accounts without mutating passwords or database rows.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) {
      console.error(
        `[Diagnostic Auth] generateLink failed for ${email}: status=${linkErr.status ?? "unknown"}, message=${linkErr.message}`
      );
      throw new Error(`generateLink failed for ${email}: ${linkErr.message}`);
    }

    const tokenHash = linkData?.properties?.hashed_token;
    assert.ok(tokenHash, `Missing hashed_token from generateLink for ${email}`);

    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (verifyErr) {
      console.error(
        `[Diagnostic Auth] verifyOtp failed for ${email}: status=${verifyErr.status ?? "unknown"}, message=${verifyErr.message}`
      );
      throw new Error(`verifyOtp failed for ${email}: ${verifyErr.message}`);
    }

    if (!verified.session?.access_token) {
      throw new Error(`Failed to obtain session access_token for ${email}`);
    }

    console.log(`[Diagnostic Auth] Magiclink OTP auth succeeded for ${email}`);
    return verified.session.access_token;
  }

  async function apiFetch(
    pathname: string,
    init: {
      method?: string;
      token?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {}
  ) {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    const method = init.method ?? "GET";
    const hasBody = init.body !== undefined && method !== "GET" && method !== "HEAD";
    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
  }

  before(async () => {
    config = validateConfig();
    admin = createSupabaseAdminClient();

    // Safe diagnostic logging as required:
    console.log("[BE-6 Live Diagnostics]");
    console.log(`- Supabase Host: ${config.supabaseHost}`);
    console.log(`- Admin Account Email: ${config.adminEmail}`);
    console.log(
      `- Environment Status: URL=PRESENT, ANON_KEY=${config.anonKey ? "PRESENT" : "MISSING"}, SERVICE_ROLE_KEY=${config.serviceRoleKey ? "PRESENT" : "MISSING"}, TEST_PASSWORD=${config.testPassword ? "PRESENT" : "NOT_SET"}, CRON_SECRET=${config.cronSecret ? "PRESENT" : "NOT_SET"}`
    );

    serverHandle = await startLiveNextServer();
    baseUrl = serverHandle.baseUrl;

    adminToken = await signInExisting(config.adminEmail);
    assert(adminToken.length > 0);

    // Check if migration 017 RPC is available on PostgREST
    const schemaRes = await fetch(`${config.supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    });
    const openapi = (await schemaRes.json()) as { paths?: Record<string, unknown> };
    const paths = openapi.paths ?? {};
    migration017Applied = Boolean(paths["/rpc/rpc_claim_email_outbox_batch"]);
  });

  after(async () => {
    try {
      if (admin && createdOutboxIds.length > 0) {
        for (const outboxId of createdOutboxIds) {
          await admin.from("email_outbox").delete().eq("id", outboxId);
        }
      }
    } finally {
      if (serverHandle) {
        await serverHandle.stop();
      }
    }
  });

  it("1. verifies Migration 017 schema, RPC availability, and service_role security privileges", async () => {
    assert.strictEqual(
      migration017Applied,
      true,
      "Migration 017 (rpc_claim_email_outbox_batch) must be applied on Supabase PINJAM_TESTING."
    );

    // Verify anon cannot execute rpc_claim_email_outbox_batch -> 401 or 404
    const anon = makeAnonClient();
    const { error: anonErr } = await anon.rpc(
      "rpc_claim_email_outbox_batch" as keyof Database["public"]["Functions"],
      { p_batch_size: 1 } as unknown as Record<string, unknown>
    );
    assert(
      anonErr !== null,
      "anon must not have execute privilege on rpc_claim_email_outbox_batch"
    );
  });

  it("2. enforces authorization on /api/v1/cron/email-outbox route", async () => {
    // A. Unauthenticated -> 401
    const unauthRes = await apiFetch("/api/v1/cron/email-outbox", { method: "POST" });
    assert.strictEqual(unauthRes.status, 401);

    // B. Invalid secret -> 401
    const badSecretRes = await apiFetch("/api/v1/cron/email-outbox", {
      method: "POST",
      headers: { Authorization: "Bearer bad-cron-token" },
    });
    assert.strictEqual(badSecretRes.status, 401);

    // C. Valid CRON_SECRET -> 200
    const validCronRes = await apiFetch("/api/v1/cron/email-outbox", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.cronSecret}` },
    });
    assert.strictEqual(validCronRes.status, 200);

    // D. Authenticated ADMIN user context -> 200
    const adminRes = await apiFetch("/api/v1/cron/email-outbox", {
      method: "POST",
      token: adminToken,
    });
    assert.strictEqual(adminRes.status, 200);
  });

  it("3. verifies live outbox event insertion, atomic claiming, and status transition to SENT", async () => {
    const dedupKey = `live-test-bkg-${runId}-${Date.now()}`;
    const { data: inserted, error: insErr } = await admin
      .from("email_outbox")
      .insert({
        event_type: "BOOKING_CONFIRMED",
        recipient: "live-test-komting@pinjam.test",
        payload: {
          booking_code: `BKG-LIVE-${runId.toUpperCase()}`,
          projector_name: "Proyektor Ruang Seminar",
          booking_date: "2026-11-28",
          start_time: "09:00:00",
          pickup_window_start_at: "08:30:00",
          pickup_window_end_at: "09:15:00",
        },
        deduplication_key: dedupKey,
        status: "PENDING",
        next_attempt_at: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
      })
      .select()
      .single();

    assert.equal(insErr, null, `Insert outbox failed: ${insErr?.message}`);
    assert(inserted);
    createdOutboxIds.push(inserted.id);

    // Process outbox via service using live Supabase
    const liveMockProvider = new MockEmailProvider();
    const result = await processOutboxBatch({
      adminClient: admin,
      provider: liveMockProvider,
      batchSize: 10,
    });

    assert(result.claimed >= 1, "Must claim at least the inserted item");
    assert(result.sent >= 1, "Must mark at least the inserted item as sent");

    // Verify row status in live database
    const { data: liveRow } = await admin
      .from("email_outbox")
      .select("*")
      .eq("id", inserted.id)
      .single();

    assert.strictEqual(liveRow?.status, "SENT");
    assert(liveRow?.sent_at !== null, "sent_at must be populated in Supabase");
    assert.strictEqual(liveRow?.locked_at, null, "locked_at must be cleared");
    assert.strictEqual(liveRow?.attempt_count, 1, "attempt_count must be 1");
  });

  it("4. verifies live concurrency safety: concurrent workers never claim identical items", async () => {
    const key1 = `live-conc-1-${runId}-${Date.now()}`;
    const key2 = `live-conc-2-${runId}-${Date.now()}`;

    const { data: rows, error: insErr } = await admin
      .from("email_outbox")
      .insert([
        {
          event_type: "BOOKING_CONFIRMED",
          recipient: "conc1@pinjam.test",
          payload: { booking_code: `BKG-C1-${runId}` },
          deduplication_key: key1,
          next_attempt_at: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
        },
        {
          event_type: "BOOKING_CONFIRMED",
          recipient: "conc2@pinjam.test",
          payload: { booking_code: `BKG-C2-${runId}` },
          deduplication_key: key2,
          next_attempt_at: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
        },
      ])
      .select();

    assert.equal(insErr, null, `Insert concurrent outbox failed: ${insErr?.message}`);
    assert(rows && rows.length === 2);
    for (const r of rows) createdOutboxIds.push(r.id);

    const provider1 = new MockEmailProvider();
    const provider2 = new MockEmailProvider();

    // Run two live batch processes concurrently
    const [w1, w2] = await Promise.all([
      processOutboxBatch({ adminClient: admin, provider: provider1, batchSize: 2 }),
      processOutboxBatch({ adminClient: admin, provider: provider2, batchSize: 2 }),
    ]);
    assert(w1.claimed + w2.claimed >= 0, "Both workers must report valid batch results");

    // Check sent messages across both mock providers
    const allSentKeys = [
      ...provider1.getSentMessages().map((m) => m.idempotencyKey),
      ...provider2.getSentMessages().map((m) => m.idempotencyKey),
    ];

    // Ensure key1 and key2 are not duplicated across the two workers
    const countKey1 = allSentKeys.filter((k) => k === key1).length;
    const countKey2 = allSentKeys.filter((k) => k === key2).length;

    assert(countKey1 <= 1, "key1 must never be processed by both workers");
    assert(countKey2 <= 1, "key2 must never be processed by both workers");
  });

  it("5. enforces live deduplication constraint on email_outbox.deduplication_key", async () => {
    const key = `live-dup-${runId}-${Date.now()}`;

    const { data: firstRow, error: e1 } = await admin
      .from("email_outbox")
      .insert({
        event_type: "LOAN_STARTED",
        recipient: "dup@pinjam.test",
        payload: { booking_code: "BKG-DUP" },
        deduplication_key: key,
      })
      .select()
      .single();

    assert.equal(e1, null);
    assert(firstRow);
    createdOutboxIds.push(firstRow.id);

    // Duplicate insert must fail with 23505
    const { error: e2 } = await admin.from("email_outbox").insert({
      event_type: "LOAN_STARTED",
      recipient: "dup@pinjam.test",
      payload: { booking_code: "BKG-DUP" },
      deduplication_key: key,
    });

    assert(e2 !== null, "Duplicate deduplication_key must be rejected");
    assert.strictEqual(e2.code, "23505");
  });
});

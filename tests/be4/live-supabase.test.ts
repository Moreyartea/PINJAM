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
import { getJakartaNowParts, jakartaDateTimeToUtc } from "@/lib/utils/jakarta-time";

loadEnvLocal();

const LIVE_ENABLED =
  process.env.PINJAM_RUN_LIVE_BE4_TESTS === "true" ||
  process.env.PINJAM_RUN_LIVE_AUTH_TESTS === "true";

interface LiveBe4Config {
  supabaseUrl: string;
  supabaseHost: string;
  anonKey: string;
  serviceRoleKey: string;
  testPassword: string | null;
  adminEmail: string;
}

function validateConfig(): LiveBe4Config {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const testPassword = (process.env.PINJAM_TEST_USER_PASSWORD ?? "").trim() || null;
  const adminEmail = (process.env.PINJAM_TEST_ADMIN_EMAIL ?? "conc-admin@example.test")
    .trim()
    .toLowerCase();

  if (!isValidHttpUrl(supabaseUrl)) {
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL for live BE-4 tests.");
  }
  const parsed = new URL(supabaseUrl);
  if (supabaseUrl.toLowerCase().includes("prod")) {
    throw new Error(`Refusing live test against production host: ${parsed.hostname}`);
  }
  if (!anonKey || !serviceRoleKey || anonKey === serviceRoleKey) {
    throw new Error("Invalid public/service role keys for live BE-4 tests.");
  }

  return {
    supabaseUrl,
    supabaseHost: parsed.hostname,
    anonKey,
    serviceRoleKey,
    testPassword,
    adminEmail,
  };
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (!address || typeof address === "string") {
        srv.close(() => reject(new Error("Could not acquire free port.")));
        return;
      }
      const { port } = address;
      srv.close(() => resolve(port));
    });
  });
}

async function startLiveNextServer(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const configured = (process.env.PINJAM_LIVE_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) {
    return { baseUrl: configured, stop: async () => {} };
  }

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const hasBuild = fs.existsSync(path.join(process.cwd(), ".next", "BUILD_ID"));
  const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
  const args = hasBuild
    ? ["start", "--port", String(port), "--hostname", "127.0.0.1"]
    : ["dev", "--port", String(port), "--hostname", "127.0.0.1"];

  let stderrTail = "";
  const child: ChildProcess = spawn(nextBin, args, {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stderr?.on("data", (c: Buffer) => {
    stderrTail = (stderrTail + c.toString("utf8")).slice(-2000);
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited prematurely (${child.exitCode}): ${stderrTail}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/v1/auth/session`);
      if (res.ok || res.status === 401) {
        return {
          baseUrl,
          stop: async () => {
            if (child.exitCode !== null) return;
            child.kill("SIGTERM");
            await new Promise<void>((resolve) => {
              const t = setTimeout(() => {
                if (child.exitCode === null) child.kill("SIGKILL");
                resolve();
              }, 3000);
              child.once("exit", () => {
                clearTimeout(t);
                resolve();
              });
            });
          },
        };
      }
    } catch {
      // Booting
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  child.kill("SIGKILL");
  throw new Error(`Timed out waiting for Next.js server: ${stderrTail}`);
}

describe("Live BE-4 Integration Testing (PINJAM_TESTING)", { skip: !LIVE_ENABLED }, () => {
  const runId = crypto.randomUUID().slice(0, 8);
  let config: LiveBe4Config;
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  let serverHandle: { baseUrl: string; stop: () => Promise<void> } | null = null;
  let baseUrl = "";
  let staffToken = "";
  let adminToken = "";
  let migration014Applied = false;

  const createdProjectorIds: string[] = [];
  const createdBookingIds: string[] = [];
  const createdLoanIds: string[] = [];

  interface EphemeralUser {
    authId: string;
    userId: string;
    email: string;
    token: string;
    assignmentId?: string;
  }
  const ephemeralUsers: EphemeralUser[] = [];

  function makeAnonClient() {
    return createClient<Database>(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async function signInExisting(email: string): Promise<string> {
    const anon = makeAnonClient();
    if (config.testPassword) {
      const { data, error } = await anon.auth.signInWithPassword({
        email,
        password: config.testPassword,
      });
      if (!error && data.session?.access_token) return data.session.access_token;
    }
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    assert.equal(linkErr, null);
    const { data: verified, error: vErr } = await anon.auth.verifyOtp({
      token_hash: linkData!.properties.hashed_token,
      type: "magiclink",
    });
    assert.equal(vErr, null);
    return verified.session?.access_token ?? "";
  }

  async function createEphemeralKomting(
    tag: string,
    options: { accountStatus?: "ACTIVE" | "INACTIVE"; assignStatus?: "ACTIVE" | "NONE" } = {}
  ): Promise<EphemeralUser> {
    const email = `be4-live-${runId}-${tag}@example.test`;
    const pwd = `${crypto.randomUUID()}Aa1!`;

    const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: pwd,
      email_confirm: true,
    });
    assert.equal(authErr, null, `createUser auth failed: ${authErr?.message}`);
    assert(authCreated.user);

    const { data: dbUser, error: dbErr } = await admin
      .from("users")
      .insert({
        email,
        full_name: `Test Komting ${tag}`,
        role: "KOMTING",
        account_status: options.accountStatus ?? "ACTIVE",
        auth_provider_user_id: authCreated.user.id,
      })
      .select("*")
      .single();
    assert.equal(dbErr, null, `insert users failed: ${dbErr?.message}`);
    assert(dbUser);

    let assignmentId: string | undefined;
    if (options.assignStatus !== "NONE") {
      const { data: dbAssign, error: aErr } = await admin
        .from("komting_assignments")
        .insert({
          user_id: dbUser.id,
          class_name: `TI-${tag.toUpperCase()}`,
          status: "ACTIVE",
        })
        .select("id")
        .single();
      assert.equal(aErr, null, `insert komting_assignments failed: ${aErr?.message}`);
      assert(dbAssign);
      assignmentId = dbAssign.id;
    }

    const anon = makeAnonClient();
    const { data: loginData, error: loginErr } = await anon.auth.signInWithPassword({
      email,
      password: pwd,
    });
    assert.equal(loginErr, null);
    const token = loginData.session?.access_token ?? "";
    assert(token.length > 0);

    const record: EphemeralUser = {
      authId: authCreated.user.id,
      userId: dbUser.id,
      email,
      token,
      assignmentId,
    };
    ephemeralUsers.push(record);
    return record;
  }

  async function apiFetch(
    pathname: string,
    init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}
  ) {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(`${baseUrl}${pathname}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }

  before(async () => {
    config = validateConfig();
    admin = createSupabaseAdminClient();
    serverHandle = await startLiveNextServer();
    baseUrl = serverHandle.baseUrl;

    staffToken = await signInExisting("conc-staff@example.test");
    adminToken = await signInExisting(config.adminEmail);
    assert(adminToken.length > 0);

    const schemaRes = await fetch(`${config.supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    });
    const openapi = (await schemaRes.json()) as { paths?: Record<string, unknown> };
    const paths = openapi.paths ?? {};
    migration014Applied = Boolean(
      paths["/rpc/rpc_komting_create_booking"] &&
      paths["/rpc/rpc_komting_cancel_booking"] &&
      paths["/rpc/rpc_staff_confirm_pickup"]
    );
  });

  after(async () => {
    try {
      if (admin) {
        // Clean up in strict foreign key order
        for (const loanId of createdLoanIds) {
          await admin.from("loans").delete().eq("id", loanId);
        }
        for (const bkgId of createdBookingIds) {
          await admin.from("qr_tokens").delete().eq("booking_id", bkgId);
          await admin.from("idempotency_records").delete().like("idempotency_key", `%${bkgId}%`);
          await admin.from("bookings").delete().eq("id", bkgId);
        }
        for (const projId of createdProjectorIds) {
          await admin.from("projectors").delete().eq("id", projId);
        }
        for (const u of ephemeralUsers) {
          if (u.assignmentId) {
            await admin.from("komting_assignments").delete().eq("id", u.assignmentId);
          }
          await admin.from("users").delete().eq("id", u.userId);
          await admin.auth.admin.deleteUser(u.authId);
        }
      }
    } finally {
      if (serverHandle) {
        await serverHandle.stop();
      }
    }
  });

  it("1. verifies Migration 014 RPC availability and service_role security privileges", async () => {
    assert.strictEqual(
      migration014Applied,
      true,
      "Migration 014 RPCs must be present in PostgREST OpenAPI schema."
    );

    // Call create booking RPC under service_role with dummy params (should reach PL/pgSQL validation)
    const { error: rpc1Err } = await admin.rpc("rpc_komting_create_booking", {
      p_komting_user_id: "00000000-0000-0000-0000-000000000000",
      p_projector_id: "00000000-0000-0000-0000-000000000000",
      p_booking_date: "2026-11-27",
      p_start_time: "09:00:00",
      p_estimated_return_at: "2026-11-27T05:00:00Z",
      p_operating_hours_snapshot: {},
      p_pickup_window_start_at: "2026-11-27T01:30:00Z",
      p_pickup_window_end_at: "2026-11-27T02:15:00Z",
      p_qr_token_hash: "dummyhash",
      p_qr_expires_at: "2026-11-27T02:15:00Z",
    });
    assert.strictEqual(rpc1Err?.code, "P0002", "Must reach PL/pgSQL USER_NOT_FOUND");

    // Call cancel booking RPC under service_role
    const { error: rpc2Err } = await admin.rpc("rpc_komting_cancel_booking", {
      p_booking_id: "00000000-0000-0000-0000-000000000000",
      p_komting_user_id: "00000000-0000-0000-0000-000000000000",
      p_reason: "test",
    });
    assert.strictEqual(rpc2Err?.code, "P0002", "Must reach PL/pgSQL USER_NOT_FOUND");

    // Call pickup RPC under service_role
    const { error: rpc3Err } = await admin.rpc("rpc_staff_confirm_pickup", {
      p_booking_id: "00000000-0000-0000-0000-000000000000",
      p_staff_user_id: "00000000-0000-0000-0000-000000000000",
      p_qr_payload_hash: "hash",
      p_received_by: "KOMTING",
    });
    assert.strictEqual(rpc3Err?.code, "P0001", "Must reach PL/pgSQL FORBIDDEN");
  });

  it("2. enforces authentication and role-based access across all 12 BE-4 endpoints", async () => {
    const fakeId = "11111111-1111-4111-8111-111111111111";

    const endpoints = [
      { method: "POST", path: "/api/v1/bookings" },
      { method: "GET", path: "/api/v1/komting/bookings" },
      { method: "GET", path: `/api/v1/komting/bookings/${fakeId}` },
      { method: "POST", path: `/api/v1/komting/bookings/${fakeId}/cancel` },
      { method: "GET", path: `/api/v1/komting/bookings/${fakeId}/qr` },
      { method: "GET", path: "/api/v1/komting/loans" },
      { method: "GET", path: "/api/v1/staff/bookings" },
      { method: "GET", path: `/api/v1/staff/bookings/${fakeId}` },
      { method: "POST", path: "/api/v1/staff/qr/validate" },
      { method: "POST", path: `/api/v1/staff/bookings/${fakeId}/pickup` },
      { method: "GET", path: "/api/v1/staff/loans" },
      { method: "GET", path: `/api/v1/staff/loans/${fakeId}` },
    ];

    // 1. Unauthenticated: all 12 return 401
    for (const ep of endpoints) {
      const res = await apiFetch(ep.path, { method: ep.method });
      assert.strictEqual(
        res.status,
        401,
        `Expected 401 unauthenticated on ${ep.method} ${ep.path}, got ${res.status}`
      );
    }

    // Create an ephemeral active komting user for role checks
    const activeKomting = await createEphemeralKomting("kauth");

    // 2. Role boundaries: KOMTING cannot access STAFF endpoints -> 403
    const staffOnlyEndpoints = [
      { method: "GET", path: "/api/v1/staff/bookings" },
      { method: "GET", path: `/api/v1/staff/bookings/${fakeId}` },
      { method: "POST", path: "/api/v1/staff/qr/validate" },
      { method: "POST", path: `/api/v1/staff/bookings/${fakeId}/pickup` },
      { method: "GET", path: "/api/v1/staff/loans" },
      { method: "GET", path: `/api/v1/staff/loans/${fakeId}` },
    ];

    for (const ep of staffOnlyEndpoints) {
      const res = await apiFetch(ep.path, { method: ep.method, token: activeKomting.token });
      assert.strictEqual(
        res.status,
        403,
        `Expected 403 for komting on staff endpoint ${ep.method} ${ep.path}, got ${res.status}`
      );
    }

    // 3. Role boundaries: STAFF cannot access KOMTING endpoints -> 403
    const komtingOnlyEndpoints = [
      { method: "POST", path: "/api/v1/bookings" },
      { method: "GET", path: "/api/v1/komting/bookings" },
      { method: "GET", path: `/api/v1/komting/bookings/${fakeId}` },
      { method: "POST", path: `/api/v1/komting/bookings/${fakeId}/cancel` },
      { method: "GET", path: `/api/v1/komting/bookings/${fakeId}/qr` },
      { method: "GET", path: "/api/v1/komting/loans" },
    ];

    for (const ep of komtingOnlyEndpoints) {
      const res = await apiFetch(ep.path, { method: ep.method, token: staffToken });
      assert.strictEqual(
        res.status,
        403,
        `Expected 403 for staff on komting endpoint ${ep.method} ${ep.path}, got ${res.status}`
      );
    }

    // 4. Inactive account boundary -> 403 ACCOUNT_NOT_ACTIVE
    const inactiveKomting = await createEphemeralKomting("kinact", { accountStatus: "INACTIVE" });
    const inactRes = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: inactiveKomting.token,
      body: {
        projector_id: fakeId,
        booking_date: "2026-11-27",
        start_time: "09:00:00",
        estimated_return_at: "2026-11-27T05:00:00Z",
      },
    });
    assert.strictEqual(inactRes.status, 403);
    const inactJson = (await inactRes.json()) as { error: { code: string } };
    assert.strictEqual(inactJson.error.code, "ACCOUNT_NOT_ACTIVE");
  });

  it("3. validates live booking creation, idempotency replay, and conflict prevention", async () => {
    const k1 = await createEphemeralKomting("k1");
    const k2 = await createEphemeralKomting("k2");

    // 1. Create dedicated test projector A
    const assetCodeA = `PRJ-BE4-A-${runId.toUpperCase()}`;
    const { data: projA, error: pErrA } = await admin
      .from("projectors")
      .insert({
        asset_code: assetCodeA,
        name: `Test Projector BE4-A ${runId}`,
        physical_status: "AVAILABLE",
        is_active: true,
      })
      .select("*")
      .single();

    assert.equal(pErrA, null);
    assert(projA);
    createdProjectorIds.push(projA.id);

    const { tomorrow } = getJakartaNowParts(new Date());

    // 2. Create booking by Komting 1 with Idempotency-Key
    const idemKeyA = `idem-live-create-${runId}`;
    const createPayload = {
      projector_id: projA.id,
      booking_date: tomorrow,
      start_time: "09:00:00",
      estimated_return_at: jakartaDateTimeToUtc(tomorrow, "12:00:00").toISOString(),
    };

    const bkgRes1 = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: k1.token,
      headers: { "Idempotency-Key": idemKeyA },
      body: createPayload,
    });

    assert.strictEqual(bkgRes1.status, 201);
    const bkgData1 = (await bkgRes1.json()) as {
      data: { id: string; booking_code: string; status: string; qr_payload: string };
    };
    assert.strictEqual(bkgData1.data.status, "CONFIRMED");
    const bookingIdA = bkgData1.data.id;
    createdBookingIds.push(bookingIdA);

    // 3. Replay with SAME idempotency key & SAME payload -> returns cached 201
    const bkgResReplay = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: k1.token,
      headers: { "Idempotency-Key": idemKeyA },
      body: createPayload,
    });
    assert.strictEqual(bkgResReplay.status, 201);
    const bkgDataReplay = (await bkgResReplay.json()) as { data: { id: string } };
    assert.strictEqual(bkgDataReplay.data.id, bookingIdA);

    // 4. Replay with SAME idempotency key & DIFFERENT payload -> returns 409 IDEMPOTENCY_KEY_REUSED
    const bkgResConflict = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: k1.token,
      headers: { "Idempotency-Key": idemKeyA },
      body: { ...createPayload, start_time: "10:00:00" },
    });
    assert.strictEqual(bkgResConflict.status, 409);
    const conflictJson = (await bkgResConflict.json()) as { error: { code: string } };
    assert.strictEqual(conflictJson.error.code, "IDEMPOTENCY_KEY_REUSED");

    // 5. Attempt second booking while active booking exists for Komting 1 -> returns 409 ACTIVE_BOOKING_EXISTS
    const bkgResActive = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: k1.token,
      body: {
        projector_id: projA.id,
        booking_date: tomorrow,
        start_time: "14:00:00",
        estimated_return_at: jakartaDateTimeToUtc(tomorrow, "16:00:00").toISOString(),
      },
    });
    assert.strictEqual(bkgResActive.status, 409);
    const activeJson = (await bkgResActive.json()) as { error: { code: string } };
    assert.strictEqual(activeJson.error.code, "ACTIVE_BOOKING_EXISTS");

    // 6. Attempt overlapping booking by Komting 2 on same projector -> returns 409 BOOKING_CONFLICT
    const bkgResOverlap = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: k2.token,
      body: {
        projector_id: projA.id,
        booking_date: tomorrow,
        start_time: "10:00:00",
        estimated_return_at: jakartaDateTimeToUtc(tomorrow, "13:00:00").toISOString(),
      },
    });
    assert.strictEqual(bkgResOverlap.status, 409);
    const overlapJson = (await bkgResOverlap.json()) as { error: { code: string } };
    assert.strictEqual(overlapJson.error.code, "BOOKING_CONFLICT");
  });

  it("4. validates booking cancellation, security, and QR token invalidation", async () => {
    const k1 = await createEphemeralKomting("kcan1");
    const k2 = await createEphemeralKomting("kcan2");

    // 1. Create dedicated test projector B
    const assetCodeB = `PRJ-BE4-B-${runId.toUpperCase()}`;
    const { data: projB, error: pErrB } = await admin
      .from("projectors")
      .insert({
        asset_code: assetCodeB,
        name: `Test Projector BE4-B ${runId}`,
        physical_status: "AVAILABLE",
        is_active: true,
      })
      .select("*")
      .single();

    assert.equal(pErrB, null);
    assert(projB);
    createdProjectorIds.push(projB.id);

    const { tomorrow } = getJakartaNowParts(new Date());

    // 2. Create booking for Komting 2
    const bkgResB = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: k2.token,
      body: {
        projector_id: projB.id,
        booking_date: tomorrow,
        start_time: "08:00:00",
        estimated_return_at: jakartaDateTimeToUtc(tomorrow, "11:00:00").toISOString(),
      },
    });
    assert.strictEqual(bkgResB.status, 201);
    const bkgJsonB = (await bkgResB.json()) as { data: { id: string; qr_payload: string } };
    const bookingIdB = bkgJsonB.data.id;
    const qrPayloadB = bkgJsonB.data.qr_payload;
    createdBookingIds.push(bookingIdB);

    // 3. Security: Komting 1 attempts to cancel Komting 2's booking -> returns 403 FORBIDDEN
    const crossCancelRes = await apiFetch(`/api/v1/komting/bookings/${bookingIdB}/cancel`, {
      method: "POST",
      token: k1.token,
      body: { reason: "Batal jahil" },
    });
    assert.strictEqual(crossCancelRes.status, 403);

    // 4. Owner cancels booking -> returns 200, status CANCELLED
    const cancelRes = await apiFetch(`/api/v1/komting/bookings/${bookingIdB}/cancel`, {
      method: "POST",
      token: k2.token,
      body: { reason: "Dosen berhalangan hadir." },
    });
    assert.strictEqual(cancelRes.status, 200);
    const cancelJson = (await cancelRes.json()) as { data: { status: string } };
    assert.strictEqual(cancelJson.data.status, "CANCELLED");

    // 5. Database check: qr_tokens revoked_at must not be null
    const { data: qrDb } = await admin
      .from("qr_tokens")
      .select("revoked_at")
      .eq("booking_id", bookingIdB)
      .single();
    assert(qrDb?.revoked_at !== null, "QR token must have revoked_at set after cancellation.");

    // 6. Security: QR token fetch for cancelled booking -> returns 409 BOOKING_NOT_CONFIRMED
    const qrFetchRes = await apiFetch(`/api/v1/komting/bookings/${bookingIdB}/qr`, {
      method: "GET",
      token: k2.token,
    });
    assert.strictEqual(qrFetchRes.status, 409);

    // 7. Staff QR validation of cancelled QR payload -> returns 422 QR_EXPIRED
    const qrScanRes = await apiFetch("/api/v1/staff/qr/validate", {
      method: "POST",
      token: staffToken,
      body: {
        qr_payload: qrPayloadB,
        action: "PICKUP",
      },
    });
    assert.strictEqual(qrScanRes.status, 422);
    const scanErr = (await qrScanRes.json()) as { error: { code: string } };
    assert.strictEqual(scanErr.error.code, "QR_EXPIRED");
  });

  it("5. validates live staff pickup workflow, tolerance window, and loan creation", async () => {
    const kPick = await createEphemeralKomting("kpick");

    // 1. Create dedicated test projector C
    const assetCodeC = `PRJ-BE4-C-${runId.toUpperCase()}`;
    const { data: projC, error: pErrC } = await admin
      .from("projectors")
      .insert({
        asset_code: assetCodeC,
        name: `Test Projector BE4-C ${runId}`,
        physical_status: "AVAILABLE",
        is_active: true,
      })
      .select("*")
      .single();

    assert.equal(pErrC, null);
    assert(projC);
    createdProjectorIds.push(projC.id);

    const { tomorrow } = getJakartaNowParts(new Date());

    // 2. Create booking for Komting
    const bkgResC = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: kPick.token,
      body: {
        projector_id: projC.id,
        booking_date: tomorrow,
        start_time: "13:00:00",
        estimated_return_at: jakartaDateTimeToUtc(tomorrow, "16:00:00").toISOString(),
      },
    });
    assert.strictEqual(bkgResC.status, 201);
    const bkgJsonC = (await bkgResC.json()) as { data: { id: string; qr_payload: string } };
    const bookingIdC = bkgJsonC.data.id;
    const qrPayloadC = bkgJsonC.data.qr_payload;
    createdBookingIds.push(bookingIdC);

    // 3. Pickup window tolerance check: before window opens -> returns 422
    const earlyPickupRes = await apiFetch(`/api/v1/staff/bookings/${bookingIdC}/pickup`, {
      method: "POST",
      token: staffToken,
      body: {
        qr_payload: qrPayloadC,
        received_by: "KOMTING",
        confirmed: true,
      },
    });
    assert.strictEqual(earlyPickupRes.status, 422);

    // 4. Open the pickup window for live testing: set window to [now - 5m, now + 30m]
    const nowMs = Date.now();
    const windowStart = new Date(nowMs - 5 * 60 * 1000).toISOString();
    const windowEnd = new Date(nowMs + 30 * 60 * 1000).toISOString();
    await admin
      .from("bookings")
      .update({
        pickup_window_start_at: windowStart,
        pickup_window_end_at: windowEnd,
      })
      .eq("id", bookingIdC);

    // 5. Staff QR validation -> returns 200 valid
    const qrValRes = await apiFetch("/api/v1/staff/qr/validate", {
      method: "POST",
      token: staffToken,
      body: {
        qr_payload: qrPayloadC,
        action: "PICKUP",
      },
    });
    assert.strictEqual(qrValRes.status, 200);
    const qrValJson = (await qrValRes.json()) as { data: { valid: boolean; action: string } };
    assert.strictEqual(qrValJson.data.valid, true);
    assert.strictEqual(qrValJson.data.action, "PICKUP");

    // 6. Validation: representative pickup requires representative_name -> returns 422
    const repMissingRes = await apiFetch(`/api/v1/staff/bookings/${bookingIdC}/pickup`, {
      method: "POST",
      token: staffToken,
      body: {
        qr_payload: qrPayloadC,
        received_by: "REPRESENTATIVE",
        confirmed: true,
      },
    });
    assert.strictEqual(repMissingRes.status, 422);

    // 7. Successful pickup confirmation by Staff
    const pickupRes = await apiFetch(`/api/v1/staff/bookings/${bookingIdC}/pickup`, {
      method: "POST",
      token: staffToken,
      body: {
        qr_payload: qrPayloadC,
        received_by: "REPRESENTATIVE",
        representative_name: "Ahmad Fauzi",
        confirmed: true,
      },
    });
    assert.strictEqual(pickupRes.status, 200);
    const pickupJson = (await pickupRes.json()) as {
      data: {
        booking: { status: string };
        loan: { id: string; status: string };
        projector: { physical_status: string };
      };
    };
    assert.strictEqual(pickupJson.data.booking.status, "FULFILLED");
    assert.strictEqual(pickupJson.data.loan.status, "ACTIVE");
    assert.strictEqual(pickupJson.data.projector.physical_status, "BORROWED");
    createdLoanIds.push(pickupJson.data.loan.id);

    // 8. Database verification of loan, projector, and booking state
    const { data: bkgDb } = await admin
      .from("bookings")
      .select("status")
      .eq("id", bookingIdC)
      .single();
    assert.strictEqual(bkgDb?.status, "FULFILLED");

    const { data: projDb } = await admin
      .from("projectors")
      .select("physical_status")
      .eq("id", projC.id)
      .single();
    assert.strictEqual(projDb?.physical_status, "BORROWED");

    const { data: loanDb } = await admin
      .from("loans")
      .select("status, representative_name")
      .eq("id", pickupJson.data.loan.id)
      .single();
    assert.strictEqual(loanDb?.status, "ACTIVE");
    assert.strictEqual(loanDb?.representative_name, "Ahmad Fauzi");

    // 9. Double pickup prevention -> returns 409 BOOKING_ALREADY_FULFILLED
    const doublePickupRes = await apiFetch(`/api/v1/staff/bookings/${bookingIdC}/pickup`, {
      method: "POST",
      token: staffToken,
      body: {
        qr_payload: qrPayloadC,
        received_by: "KOMTING",
        confirmed: true,
      },
    });
    assert.strictEqual(doublePickupRes.status, 409);

    // 10. Komting loan list & detail verification
    const komtingLoanListRes = await apiFetch("/api/v1/komting/loans", {
      method: "GET",
      token: kPick.token,
    });
    assert.strictEqual(komtingLoanListRes.status, 200);

    const staffLoanDetailRes = await apiFetch(`/api/v1/staff/loans/${pickupJson.data.loan.id}`, {
      method: "GET",
      token: staffToken,
    });
    assert.strictEqual(staffLoanDetailRes.status, 200);
  });

  it("6. verifies concurrent pickup race condition prevention (single loan guarantee)", async () => {
    const kRace = await createEphemeralKomting("krace");

    // 1. Create dedicated test projector D
    const assetCodeD = `PRJ-BE4-D-${runId.toUpperCase()}`;
    const { data: projD, error: pErrD } = await admin
      .from("projectors")
      .insert({
        asset_code: assetCodeD,
        name: `Test Projector BE4-D ${runId}`,
        physical_status: "AVAILABLE",
        is_active: true,
      })
      .select("*")
      .single();

    assert.equal(pErrD, null);
    assert(projD);
    createdProjectorIds.push(projD.id);

    const { tomorrow } = getJakartaNowParts(new Date());

    // 2. Create booking for Komting
    const bkgResD = await apiFetch("/api/v1/bookings", {
      method: "POST",
      token: kRace.token,
      body: {
        projector_id: projD.id,
        booking_date: tomorrow,
        start_time: "15:00:00",
        estimated_return_at: jakartaDateTimeToUtc(tomorrow, "17:00:00").toISOString(),
      },
    });
    assert.strictEqual(bkgResD.status, 201);
    const bkgJsonD = (await bkgResD.json()) as { data: { id: string; qr_payload: string } };
    const bookingIdD = bkgJsonD.data.id;
    const qrPayloadD = bkgJsonD.data.qr_payload;
    createdBookingIds.push(bookingIdD);

    // 3. Open pickup window for concurrency test
    const nowMs = Date.now();
    await admin
      .from("bookings")
      .update({
        pickup_window_start_at: new Date(nowMs - 5 * 60 * 1000).toISOString(),
        pickup_window_end_at: new Date(nowMs + 30 * 60 * 1000).toISOString(),
      })
      .eq("id", bookingIdD);

    // 4. Dispatch 2 concurrent pickup requests simultaneously
    const [resA, resB] = await Promise.all([
      apiFetch(`/api/v1/staff/bookings/${bookingIdD}/pickup`, {
        method: "POST",
        token: staffToken,
        body: { qr_payload: qrPayloadD, received_by: "KOMTING", confirmed: true },
      }),
      apiFetch(`/api/v1/staff/bookings/${bookingIdD}/pickup`, {
        method: "POST",
        token: staffToken,
        body: { qr_payload: qrPayloadD, received_by: "KOMTING", confirmed: true },
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepStrictEqual(
      statuses,
      [200, 409],
      "Exactly one concurrent pickup must succeed (200) and the other must be rejected (409)."
    );

    // 5. Verify exactly 1 loan exists in database for this booking
    const { data: loansDb } = await admin.from("loans").select("id").eq("booking_id", bookingIdD);
    assert.strictEqual(loansDb?.length, 1, "Exactly 1 loan must be created in database.");
    if (loansDb && loansDb[0]) {
      createdLoanIds.push(loansDb[0].id);
    }
  });

  it("7. verifies audit logs and transactional notification outbox consistency", async () => {
    // 1. Check that new audit logs record BOOKING_CREATED, BOOKING_CANCELLED, LOAN_PICKUP_CONFIRMED
    const { data: logs } = await admin
      .from("audit_logs")
      .select("action, entity_type, entity_id")
      .or(
        `entity_id.in.(${[...createdBookingIds, ...createdLoanIds].join(",")}),action.in.(BOOKING_CREATED,BOOKING_CANCELLED,LOAN_PICKUP_CONFIRMED)`
      );

    const bookingActions = new Set(
      (logs ?? []).filter((l) => createdBookingIds.includes(l.entity_id)).map((l) => l.action)
    );
    assert(
      bookingActions.has("BOOKING_CREATED"),
      "New booking must record BOOKING_CREATED audit log"
    );
    assert(
      bookingActions.has("BOOKING_CANCELLED"),
      "Cancelled booking must record BOOKING_CANCELLED audit log"
    );

    const loanActions = new Set(
      (logs ?? []).filter((l) => createdLoanIds.includes(l.entity_id)).map((l) => l.action)
    );
    assert(
      loanActions.has("LOAN_PICKUP_CONFIRMED"),
      "New loan pickup must record LOAN_PICKUP_CONFIRMED audit log"
    );

    const bookingCreatedLog = logs?.find(
      (l) => l.action === "BOOKING_CREATED" && createdBookingIds.includes(l.entity_id)
    );
    assert.strictEqual(bookingCreatedLog?.entity_type, "BOOKING");

    const bookingCancelledLog = logs?.find(
      (l) => l.action === "BOOKING_CANCELLED" && createdBookingIds.includes(l.entity_id)
    );
    assert.strictEqual(bookingCancelledLog?.entity_type, "BOOKING");

    const loanPickupLog = logs?.find(
      (l) => l.action === "LOAN_PICKUP_CONFIRMED" && createdLoanIds.includes(l.entity_id)
    );
    assert.strictEqual(loanPickupLog?.entity_type, "LOAN");

    // 2. Check email_outbox has BOOKING_CONFIRMED, BOOKING_CANCELLED, and LOAN_STARTED for test runs
    const { data: emails } = await admin
      .from("email_outbox")
      .select("event_type, deduplication_key, payload");

    const bookingEvents = new Set(
      (emails ?? [])
        .filter((e) => createdBookingIds.some((bId) => e.deduplication_key.includes(bId)))
        .map((e) => e.event_type)
    );
    assert(bookingEvents.has("BOOKING_CONFIRMED"), "Email outbox must queue BOOKING_CONFIRMED");
    assert(bookingEvents.has("BOOKING_CANCELLED"), "Email outbox must queue BOOKING_CANCELLED");

    const loanEvents = new Set(
      (emails ?? [])
        .filter((e) => createdLoanIds.some((lId) => e.deduplication_key.includes(lId)))
        .map((e) => e.event_type)
    );
    assert(loanEvents.has("LOAN_STARTED"), "Email outbox must queue LOAN_STARTED");

    // 3. Verify deduplication: idempotent replay does not create duplicate audit log or outbox record
    const bookingAId = createdBookingIds[0];
    if (bookingAId) {
      const bkgLogs = (logs ?? []).filter(
        (l) => l.action === "BOOKING_CREATED" && l.entity_id === bookingAId
      );
      assert.strictEqual(
        bkgLogs.length,
        1,
        "Idempotent replay must not duplicate BOOKING_CREATED audit log."
      );

      const bkgEmails = (emails ?? []).filter(
        (e) => e.deduplication_key === `booking_confirmed:${bookingAId}`
      );
      assert.strictEqual(
        bkgEmails.length,
        1,
        "Idempotent replay must not duplicate BOOKING_CONFIRMED in email_outbox."
      );
    }

    // 4. Verify deduplication for concurrent pickup: exactly 1 LOAN_STARTED event per loan
    for (const loanId of createdLoanIds) {
      const loanEmails = (emails ?? []).filter(
        (e) => e.deduplication_key === `loan_started:${loanId}`
      );
      assert.strictEqual(
        loanEmails.length,
        1,
        "Concurrent pickup must not duplicate LOAN_STARTED in email_outbox."
      );
    }
  });
});

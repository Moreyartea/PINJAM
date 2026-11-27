import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
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
  process.env.PINJAM_RUN_LIVE_BE5_TESTS === "true" ||
  process.env.PINJAM_RUN_LIVE_AUTH_TESTS === "true";

interface LiveBe5Config {
  supabaseUrl: string;
  supabaseHost: string;
  anonKey: string;
  serviceRoleKey: string;
  testPassword: string | null;
  adminEmail: string;
}

function validateConfig(): LiveBe5Config {
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
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL for live BE-5 tests.");
  }
  const parsed = new URL(supabaseUrl);
  if (supabaseUrl.toLowerCase().includes("prod")) {
    throw new Error(`Refusing live test against production host: ${parsed.hostname}`);
  }
  if (!anonKey || !serviceRoleKey || anonKey === serviceRoleKey) {
    throw new Error("Invalid public/service role keys for live BE-5 tests.");
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

  let ready = false;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/auth/session`, { method: "GET" });
      if (res.status === 200 || res.status === 401) {
        ready = true;
        break;
      }
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!ready) {
    child.kill("SIGKILL");
    throw new Error(`Next.js test server failed to start on port ${port}. Stderr: ${stderrTail}`);
  }

  return {
    baseUrl,
    stop: async () => {
      if (!child.killed) {
        child.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 600));
        if (!child.killed) child.kill("SIGKILL");
      }
    },
  };
}

describe(
  "Sprint BE-5: Live Integration Validation on Supabase PINJAM_TESTING",
  { concurrency: 1 },
  () => {
    if (!LIVE_ENABLED) {
      it("SKIPPED: Live BE-5 tests disabled. Set PINJAM_RUN_LIVE_BE5_TESTS=true to run.", () => {
        // skipped
      });
      return;
    }

    let config: LiveBe5Config;
    let admin: ReturnType<typeof createSupabaseAdminClient>;
    let serverHandle: { baseUrl: string; stop: () => Promise<void> };
    let baseUrl: string;

    let staffToken: string;
    let adminToken: string;
    let staffUserId: string;

    let migration016Applied = false;

    const runId = Math.random().toString(36).substring(2, 8);
    const createdProjectorIds: string[] = [];
    const createdBookingIds: string[] = [];
    const createdLoanIds: string[] = [];
    const createdMaintenanceIds: string[] = [];

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

    async function createEphemeralKomting(tag: string): Promise<EphemeralUser> {
      const email = `be5-live-${runId}-${tag}@example.test`;
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
          account_status: "ACTIVE",
          auth_provider_user_id: authCreated.user.id,
        })
        .select("*")
        .single();
      assert.equal(dbErr, null, `insert users failed: ${dbErr?.message}`);
      assert(dbUser);

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
        assignmentId: dbAssign.id,
      };
      ephemeralUsers.push(record);
      return record;
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
      if (hasBody && !(init.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }
      return fetch(`${baseUrl}${pathname}`, {
        method,
        headers,
        body: !hasBody
          ? undefined
          : init.body instanceof FormData
            ? init.body
            : JSON.stringify(init.body),
      });
    }

    async function setupActiveLoan(komtingUser: EphemeralUser, assetSuffix: string) {
      const { tomorrow } = getJakartaNowParts();

      // 1. Create projector
      const assetCode = `BE5-${runId}-${assetSuffix}`.toUpperCase().slice(0, 20);
      const { data: proj, error: pErr } = await admin
        .from("projectors")
        .insert({
          asset_code: assetCode,
          name: `Proyektor Test BE-5 ${assetSuffix}`,
          brand: "Epson",
          model: "EB-E500",
          physical_status: "AVAILABLE",
          is_active: true,
        })
        .select()
        .single();
      assert.equal(pErr, null, `setup projector failed: ${pErr?.message}`);
      createdProjectorIds.push(proj.id);

      // 2. Create booking via API
      const estReturn = jakartaDateTimeToUtc(tomorrow, "15:00:00").toISOString();
      const bkgRes = await apiFetch("/api/v1/bookings", {
        method: "POST",
        token: komtingUser.token,
        body: {
          projector_id: proj.id,
          booking_date: tomorrow,
          start_time: "09:00:00",
          estimated_return_at: estReturn,
        },
      });
      const bkgJson = (await bkgRes.json()) as {
        data: { id: string; qr_payload: string; booking_code: string };
      };
      assert.strictEqual(bkgRes.status, 201, `Create booking failed: ${JSON.stringify(bkgJson)}`);
      const bookingId = bkgJson.data.id;
      const qrRaw = bkgJson.data.qr_payload;
      createdBookingIds.push(bookingId);

      // 3. Open pickup window for live testing
      const nowMs = Date.now();
      const windowStart = new Date(nowMs - 5 * 60 * 1000).toISOString();
      const windowEnd = new Date(nowMs + 30 * 60 * 1000).toISOString();
      await admin
        .from("bookings")
        .update({
          pickup_window_start_at: windowStart,
          pickup_window_end_at: windowEnd,
        })
        .eq("id", bookingId);

      // 4. Staff confirms pickup
      const pickupRes = await apiFetch(`/api/v1/staff/bookings/${bookingId}/pickup`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          confirmed: true,
          received_by: "KOMTING",
        },
      });
      const pickupJson = (await pickupRes.json()) as { data: { loan: { id: string } } };
      assert.strictEqual(pickupRes.status, 200, `Pickup failed: ${JSON.stringify(pickupJson)}`);
      const loanId = pickupJson.data.loan.id;
      createdLoanIds.push(loanId);

      return {
        projector: proj,
        bookingId,
        bookingCode: bkgJson.data.booking_code,
        loanId,
        qrRaw,
      };
    }

    async function cleanupFixture(ids: {
      loanId?: string;
      bookingId?: string;
      projectorId?: string;
      komting?: EphemeralUser;
    }) {
      if (!admin) return;
      if (ids.loanId) {
        await admin.from("loan_fines").delete().eq("loan_id", ids.loanId);
        await admin.from("return_inspections").delete().eq("loan_id", ids.loanId);
        await admin.from("loans").delete().eq("id", ids.loanId);
        const lIdx = createdLoanIds.indexOf(ids.loanId);
        if (lIdx !== -1) createdLoanIds.splice(lIdx, 1);
      }
      if (ids.bookingId) {
        await admin.from("qr_tokens").delete().eq("booking_id", ids.bookingId);
        await admin
          .from("idempotency_records")
          .delete()
          .like("idempotency_key", `%${ids.bookingId}%`);
        await admin.from("bookings").delete().eq("id", ids.bookingId);
        const bIdx = createdBookingIds.indexOf(ids.bookingId);
        if (bIdx !== -1) createdBookingIds.splice(bIdx, 1);
      }
      if (ids.projectorId) {
        await admin.from("maintenance_records").delete().eq("projector_id", ids.projectorId);
        await admin.from("projectors").delete().eq("id", ids.projectorId);
        const pIdx = createdProjectorIds.indexOf(ids.projectorId);
        if (pIdx !== -1) createdProjectorIds.splice(pIdx, 1);
      }
      if (ids.komting) {
        if (ids.komting.assignmentId) {
          await admin.from("komting_assignments").delete().eq("id", ids.komting.assignmentId);
        }
        await admin.from("users").delete().eq("id", ids.komting.userId);
        await admin.auth.admin.deleteUser(ids.komting.authId);
        const uIdx = ephemeralUsers.indexOf(ids.komting);
        if (uIdx !== -1) ephemeralUsers.splice(uIdx, 1);
      }
    }

    before(async () => {
      config = validateConfig();
      admin = createSupabaseAdminClient();
      serverHandle = await startLiveNextServer();
      baseUrl = serverHandle.baseUrl;

      staffToken = await signInExisting("conc-staff@example.test");
      adminToken = await signInExisting(config.adminEmail);
      assert(adminToken.length > 0);

      const { data: staffUser } = await admin
        .from("users")
        .select("id")
        .eq("email", "conc-staff@example.test")
        .single();
      assert(staffUser);
      staffUserId = staffUser.id;

      // Check if migration 016 RPC is available
      const schemaRes = await fetch(`${config.supabaseUrl}/rest/v1/`, {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
      });
      const openapi = (await schemaRes.json()) as { paths?: Record<string, unknown> };
      const paths = openapi.paths ?? {};
      migration016Applied = Boolean(paths["/rpc/rpc_staff_confirm_return"]);
    });

    after(async () => {
      try {
        if (admin) {
          // Strict foreign key cleanup order
          for (const loanId of createdLoanIds) {
            await admin.from("loan_fines").delete().eq("loan_id", loanId);
            await admin.from("return_inspections").delete().eq("loan_id", loanId);
            await admin.from("loans").delete().eq("id", loanId);
          }
          for (const projId of createdProjectorIds) {
            await admin.from("maintenance_records").delete().eq("projector_id", projId);
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

    it("1. verifies Migration 016 schema, RPC availability, and service_role security privileges", async () => {
      assert.strictEqual(
        migration016Applied,
        true,
        "Migration 016 (rpc_staff_confirm_return) must be applied on Supabase PINJAM_TESTING."
      );

      // Call RPC with dummy values to ensure PL/pgSQL validation runs under service_role
      const { error: rpcErr } = await admin.rpc("rpc_staff_confirm_return", {
        p_loan_id: "00000000-0000-0000-0000-000000000000",
        p_staff_user_id: staffUserId,
        p_qr_payload_hash: "dummyhash",
        p_returned_by: "KOMTING",
      });

      assert.strictEqual(
        rpcErr?.code,
        "P0002",
        "Must reach PL/pgSQL LOAN_NOT_FOUND error code P0002"
      );
    });

    it("2. enforces authentication and role-based access across all BE-5 endpoints", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const komting = await createEphemeralKomting("auth-guard");

      const endpoints = [
        { path: `/api/v1/komting/loans/${fakeId}`, method: "GET", roleAllowed: "KOMTING" },
        { path: `/api/v1/komting/loans/${fakeId}/return`, method: "POST", roleAllowed: "KOMTING" },
        { path: `/api/v1/staff/loans/${fakeId}/return`, method: "GET", roleAllowed: "STAFF" },
        { path: `/api/v1/staff/loans/${fakeId}/return`, method: "POST", roleAllowed: "STAFF" },
        { path: `/api/v1/staff/loans/${fakeId}/inspection`, method: "GET", roleAllowed: "STAFF" },
      ];

      for (const ep of endpoints) {
        // 1. Unauthenticated -> 401
        const unauthRes = await apiFetch(ep.path, { method: ep.method, body: {} });
        assert.strictEqual(
          unauthRes.status,
          401,
          `Expected 401 on unauthenticated ${ep.method} ${ep.path}, got ${unauthRes.status}`
        );

        // 2. Role mismatch -> 403
        if (ep.roleAllowed === "STAFF") {
          const forbiddenRes = await apiFetch(ep.path, {
            method: ep.method,
            token: komting.token,
            body: {},
          });
          assert.strictEqual(
            forbiddenRes.status,
            403,
            `Expected 403 for KOMTING calling STAFF endpoint ${ep.method} ${ep.path}, got ${forbiddenRes.status}`
          );
        } else if (ep.roleAllowed === "KOMTING") {
          const forbiddenRes = await apiFetch(ep.path, {
            method: ep.method,
            token: staffToken,
            body: {},
          });
          assert.strictEqual(
            forbiddenRes.status,
            403,
            `Expected 403 for STAFF calling KOMTING endpoint ${ep.method} ${ep.path}, got ${forbiddenRes.status}`
          );
        }
      }
    });

    it("3. validates QR return scanning via POST /api/v1/staff/qr/validate", async () => {
      const komting = await createEphemeralKomting("qr-test");
      const { qrRaw } = await setupActiveLoan(komting, "qr");

      // Scan QR with action RETURN -> 200 valid
      const validRes = await apiFetch("/api/v1/staff/qr/validate", {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          action: "RETURN",
        },
      });
      const validJson = await validRes.json();
      assert.strictEqual(validRes.status, 200);
      assert.strictEqual(validJson.data.valid, true);
      assert.strictEqual(validJson.data.action, "RETURN");
      assert.strictEqual(validJson.data.requires_confirmation, true);

      // Reject unknown QR payload
      const invalidRes = await apiFetch("/api/v1/staff/qr/validate", {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: "pinjam://qr/booking/NONEXISTENT",
          action: "RETURN",
        },
      });
      assert.strictEqual(invalidRes.status, 404);
    });

    it("4. validates QR token constraints and atomicity on return confirmation", async () => {
      // --- Fixture 1: Validates Missing QR, Mismatched QR, Revoked QR, and Atomicity ---
      let komtingInvar: EphemeralUser | undefined;
      let fixtureInvar:
        | {
            projector: { id: string };
            bookingId: string;
            bookingCode: string;
            loanId: string;
            qrRaw: string;
          }
        | undefined;

      try {
        komtingInvar = await createEphemeralKomting("qr-invar");
        fixtureInvar = await setupActiveLoan(komtingInvar, "qrinvar");
        const { loanId, qrRaw, bookingId, projector } = fixtureInvar;

        // A. Rejects missing QR payload / NULL hash -> 400
        const missingQrRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
          method: "POST",
          token: staffToken,
          body: {
            returned_by: "KOMTING",
            projector_condition: "NORMAL",
            accessories_condition: "COMPLETE",
          },
        });
        assert.strictEqual(
          missingQrRes.status,
          400,
          "Must reject return confirmation when QR payload is missing"
        );

        // B. Rejects mismatched QR payload -> 422
        const mismatchQrRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
          method: "POST",
          token: staffToken,
          body: {
            qr_payload: "pinjam://qr/booking/BKG-OTHER-12345/TOKEN9999",
            returned_by: "KOMTING",
            projector_condition: "NORMAL",
            accessories_condition: "COMPLETE",
          },
        });
        assert.strictEqual(
          mismatchQrRes.status,
          422,
          "Must reject return confirmation when QR payload hash does not match loan booking"
        );

        // C. Rejects revoked QR token -> 422
        // Note: Trigger trg_qr_tokens_lifecycle_guard permits marking revoked_at on active token,
        // but forbids reactivating a revoked token. We test revocation directly on loanId.
        const { error: revokeErr } = await admin
          .from("qr_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("booking_id", bookingId);
        assert.equal(revokeErr, null, `Revoking QR token must succeed: ${revokeErr?.message}`);

        const revokedQrRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
          method: "POST",
          token: staffToken,
          body: {
            qr_payload: qrRaw,
            returned_by: "KOMTING",
            projector_condition: "NORMAL",
            accessories_condition: "COMPLETE",
          },
        });
        assert.strictEqual(
          revokedQrRes.status,
          422,
          "Must reject return confirmation when QR token is revoked"
        );

        // D. Transaction atomicity: Verify failed attempts did not alter loan or create partial records
        const { data: intactLoan } = await admin
          .from("loans")
          .select("*")
          .eq("id", loanId)
          .single();
        assert.strictEqual(
          intactLoan?.status,
          "ACTIVE",
          "Loan must remain ACTIVE after rejected attempts"
        );
        assert.strictEqual(intactLoan?.returned_at, null, "returned_at must remain NULL");

        const { data: intactProj } = await admin
          .from("projectors")
          .select("*")
          .eq("id", projector.id)
          .single();
        assert.strictEqual(
          intactProj?.physical_status,
          "BORROWED",
          "Projector must remain BORROWED"
        );

        const { data: partialInsp } = await admin
          .from("return_inspections")
          .select("id")
          .eq("loan_id", loanId);
        assert.strictEqual(
          partialInsp?.length,
          0,
          "No return inspection record should exist after failed attempts"
        );

        const { data: partialFine } = await admin
          .from("loan_fines")
          .select("id")
          .eq("loan_id", loanId);
        assert.strictEqual(
          partialFine?.length,
          0,
          "No loan fine record should exist after failed attempts"
        );
      } finally {
        if (fixtureInvar) {
          await cleanupFixture({
            loanId: fixtureInvar.loanId,
            bookingId: fixtureInvar.bookingId,
            projectorId: fixtureInvar.projector.id,
            komting: komtingInvar,
          });
        }
      }

      // --- Fixture 2: Validates Expired QR and Atomicity in Natural Wall-Clock Time ---
      // Uses a dedicated Komting account to ensure complete isolation and prevent ACTIVE_LOAN_EXISTS conflicts.
      let komtingExpired: EphemeralUser | undefined;
      let fixtureExpired:
        | {
            projector: { id: string };
            bookingId: string;
            bookingCode: string;
            loanId: string;
            qrRaw: string;
          }
        | undefined;

      try {
        komtingExpired = await createEphemeralKomting("qr-exp");
        fixtureExpired = await setupActiveLoan(komtingExpired, "qrexp");

        const { data: expQrRow, error: expQrFetchErr } = await admin
          .from("qr_tokens")
          .select("pickup_used_at")
          .eq("booking_id", fixtureExpired.bookingId)
          .single();
        assert.equal(
          expQrFetchErr,
          null,
          `Fetching QR row must succeed: ${expQrFetchErr?.message}`
        );
        assert(expQrRow?.pickup_used_at, "pickup_used_at must exist on active loan QR token");

        const pickupTime = new Date(expQrRow.pickup_used_at).getTime();
        const targetExpiresAt = new Date(pickupTime + 1000).toISOString();

        const { error: expUpdateErr } = await admin
          .from("qr_tokens")
          .update({ expires_at: targetExpiresAt })
          .eq("booking_id", fixtureExpired.bookingId);
        assert.equal(
          expUpdateErr,
          null,
          `Update expires_at to near-future must succeed: ${expUpdateErr?.message}`
        );

        // Wait 1500ms so Postgres wall clock time naturally passes expires_at
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const expiredQrRes = await apiFetch(`/api/v1/staff/loans/${fixtureExpired.loanId}/return`, {
          method: "POST",
          token: staffToken,
          body: {
            qr_payload: fixtureExpired.qrRaw,
            returned_by: "KOMTING",
            projector_condition: "NORMAL",
            accessories_condition: "COMPLETE",
          },
        });
        assert.strictEqual(
          expiredQrRes.status,
          422,
          "Must reject return confirmation when QR token is expired"
        );

        // Verify atomicity on expired fixture
        const { data: intactExpiredLoan } = await admin
          .from("loans")
          .select("status, returned_at")
          .eq("id", fixtureExpired.loanId)
          .single();
        assert.strictEqual(
          intactExpiredLoan?.status,
          "ACTIVE",
          "Expired loan must remain ACTIVE after rejected attempt"
        );
        assert.strictEqual(intactExpiredLoan?.returned_at, null, "returned_at must remain NULL");
      } finally {
        if (fixtureExpired) {
          await cleanupFixture({
            loanId: fixtureExpired.loanId,
            bookingId: fixtureExpired.bookingId,
            projectorId: fixtureExpired.projector.id,
            komting: komtingExpired,
          });
        }
      }
    });

    it("5. validates disposition business rules and fine assessment constraints", async () => {
      const komting = await createEphemeralKomting("disp-fine");
      const { loanId, qrRaw } = await setupActiveLoan(komting, "dispfine");

      // A. Rejects DAMAGED condition with unit_disposition AVAILABLE -> 422
      const invalidDispRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "DAMAGED",
          accessories_condition: "COMPLETE",
          unit_disposition: "AVAILABLE",
          evidence_photo_storage_key: "evidence/test.jpg",
        },
      });
      assert.strictEqual(
        invalidDispRes.status,
        422,
        "Must reject DAMAGED condition when unit_disposition is set to AVAILABLE"
      );

      // B. Rejects negative fine amount -> 400
      const negativeFineRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "NORMAL",
          accessories_condition: "COMPLETE",
          fine_amount: -25000,
        },
      });
      assert.strictEqual(negativeFineRes.status, 400, "Must reject negative fine amount");

      // C. Rejects positive manual fine when condition is NORMAL and COMPLETE -> 422
      const positiveFineNormalRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "NORMAL",
          accessories_condition: "COMPLETE",
          fine_amount: 50000,
          fine_notes: "Denda sepihak",
        },
      });
      assert.strictEqual(
        positiveFineNormalRes.status,
        422,
        "Must reject positive manual fine when condition is NORMAL + COMPLETE"
      );

      // D. Rejects positive manual fine without fine notes -> 422
      const missingNotesRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "DAMAGED",
          accessories_condition: "COMPLETE",
          evidence_photo_storage_key: "evidence/test.jpg",
          fine_amount: 50000,
          fine_notes: "",
        },
      });
      assert.strictEqual(
        missingNotesRes.status,
        422,
        "Must reject positive manual fine when fine notes is omitted or empty"
      );
    });

    it("6. validates normal return workflow, inspection recording, and unit AVAILABLE disposition", async () => {
      const komting = await createEphemeralKomting("normal-ret");
      const { loanId, qrRaw, projector } = await setupActiveLoan(komting, "normal");

      // 1. Komting checks loan detail
      const detailRes = await apiFetch(`/api/v1/komting/loans/${loanId}`, {
        method: "GET",
        token: komting.token,
      });
      const detailJson = await detailRes.json();
      assert.strictEqual(detailRes.status, 200);
      assert.strictEqual(detailJson.data.loan.status, "ACTIVE");

      // 2. Komting initiates return
      const initRes = await apiFetch(`/api/v1/komting/loans/${loanId}/return`, {
        method: "POST",
        token: komting.token,
      });
      const initJson = await initRes.json();
      assert.strictEqual(initRes.status, 200);
      assert.ok(initJson.data.instructions);

      // 3. Staff previews return summary
      const summaryRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "GET",
        token: staffToken,
      });
      const summaryJson = await summaryRes.json();
      assert.strictEqual(summaryRes.status, 200);
      assert.strictEqual(summaryJson.data.loan.status, "ACTIVE");

      // 4. Staff confirms return
      const returnRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "NORMAL",
          accessories_condition: "COMPLETE",
          note: "Unit dikembalikan tepat waktu dalam kondisi baik.",
        },
      });
      const returnJson = await returnRes.json();
      assert.strictEqual(returnRes.status, 200, `Return failed: ${JSON.stringify(returnJson)}`);
      assert.strictEqual(returnJson.data.loan.status, "RETURNED");
      assert.strictEqual(returnJson.data.projector.physical_status, "AVAILABLE");
      assert.strictEqual(returnJson.data.fine.fine_type, "NONE");
      assert.strictEqual(returnJson.data.fine.status, "EXEMPT");
      assert.strictEqual(returnJson.data.fine.amount, 0);

      // Verify database state directly
      const { data: dbLoan } = await admin.from("loans").select("*").eq("id", loanId).single();
      assert.strictEqual(dbLoan?.status, "RETURNED");
      assert.ok(dbLoan?.returned_at);

      const { data: dbProj } = await admin
        .from("projectors")
        .select("*")
        .eq("id", projector.id)
        .single();
      assert.strictEqual(dbProj?.physical_status, "AVAILABLE");

      // Verify exact single inspection and fine records
      const { data: dbInsps } = await admin
        .from("return_inspections")
        .select("*")
        .eq("loan_id", loanId);
      assert.strictEqual(dbInsps?.length, 1, "Exactly one return inspection record must exist");
      const [firstInsp] = dbInsps ?? [];
      assert.ok(firstInsp);
      assert.strictEqual(firstInsp.projector_condition, "NORMAL");
      assert.strictEqual(firstInsp.unit_disposition, "AVAILABLE");

      const { data: dbFines } = await admin.from("loan_fines").select("*").eq("loan_id", loanId);
      assert.strictEqual(dbFines?.length, 1, "Exactly one loan fine record must exist");
      const [firstFine] = dbFines ?? [];
      assert.ok(firstFine);
      assert.strictEqual(firstFine.status, "EXEMPT");
      assert.strictEqual(Number(firstFine.amount), 0);

      // Verify staff inspection GET endpoint
      const inspRes = await apiFetch(`/api/v1/staff/loans/${loanId}/inspection`, {
        method: "GET",
        token: staffToken,
      });
      const inspJson = await inspRes.json();
      assert.strictEqual(inspRes.status, 200);
      assert.strictEqual(inspJson.data.unit_disposition, "AVAILABLE");

      // Re-using the same QR token for another return must be rejected (already used)
      const reuseQrRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "NORMAL",
          accessories_condition: "COMPLETE",
        },
      });
      assert.strictEqual(
        reuseQrRes.status,
        409,
        "Must reject already used return QR token or non-active loan"
      );
    });

    it("7. validates damaged return with photo evidence requirement, MAINTENANCE transition, and fine recording", async () => {
      const komting = await createEphemeralKomting("damage-ret");
      const { loanId, qrRaw, projector } = await setupActiveLoan(komting, "damage");

      // 1. Rejects return without evidence photo when DAMAGED
      const rejectRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "DAMAGED",
          accessories_condition: "COMPLETE",
        },
      });
      assert.strictEqual(
        rejectRes.status,
        422,
        "Must reject DAMAGED condition without evidence photo"
      );

      // 2. Confirms return with photo storage key and defaults disposition to MAINTENANCE
      const photoKey = `evidence/${loanId}/damage-proof.jpg`;
      const returnRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "DAMAGED",
          accessories_condition: "COMPLETE",
          evidence_photo_storage_key: photoKey,
          fine_amount: 100000,
          fine_notes: "Ganti biaya servis lensa",
          note: "Lensa retak akibat benturan",
        },
      });
      const returnJson = await returnRes.json();
      assert.strictEqual(
        returnRes.status,
        200,
        `Damaged return failed: ${JSON.stringify(returnJson)}`
      );
      assert.strictEqual(returnJson.data.loan.status, "RETURNED");
      assert.strictEqual(returnJson.data.projector.physical_status, "MAINTENANCE");
      assert.strictEqual(returnJson.data.inspection.unit_disposition, "MAINTENANCE");
      assert.strictEqual(returnJson.data.fine.fine_type, "DAMAGE");
      assert.strictEqual(returnJson.data.fine.amount, 100000);
      assert.strictEqual(returnJson.data.fine.status, "PENDING");

      // Verify database state: projector is MAINTENANCE
      const { data: dbProj } = await admin
        .from("projectors")
        .select("*")
        .eq("id", projector.id)
        .single();
      assert.strictEqual(dbProj?.physical_status, "MAINTENANCE");

      // Verify maintenance_records was created
      const { data: dbMaint } = await admin
        .from("maintenance_records")
        .select("*")
        .eq("projector_id", projector.id)
        .eq("status", "IN_PROGRESS")
        .maybeSingle();
      assert.ok(dbMaint, "Maintenance record must be created when unit disposition is MAINTENANCE");
      if (dbMaint) {
        createdMaintenanceIds.push(dbMaint.id);
      }
    });

    it("8. validates return idempotency replay and conflict prevention", async () => {
      const komting = await createEphemeralKomting("idem-ret");
      const { loanId, qrRaw } = await setupActiveLoan(komting, "idem");
      const idempotencyKey = `idem-ret-${runId}-${crypto.randomUUID()}`;

      const payload = {
        qr_payload: qrRaw,
        returned_by: "KOMTING",
        projector_condition: "NORMAL",
        accessories_condition: "COMPLETE",
      };

      // First request -> 200
      const res1 = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: payload,
        headers: { "Idempotency-Key": idempotencyKey },
      });
      const json1 = await res1.json();
      assert.strictEqual(res1.status, 200);

      // Replay with identical payload -> cached 200
      const res2 = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: payload,
        headers: { "Idempotency-Key": idempotencyKey },
      });
      const json2 = await res2.json();
      assert.strictEqual(res2.status, 200);
      assert.deepStrictEqual(json2.data, json1.data);

      // Replay with conflicting payload -> 409
      const res3 = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          ...payload,
          returned_by: "REPRESENTATIVE",
          representative_name: "Mahasiswa Pengganti",
        },
        headers: { "Idempotency-Key": idempotencyKey },
      });
      assert.strictEqual(
        res3.status,
        409,
        "Must return 409 conflict when idempotency key is reused with different payload"
      );
    });

    it("9. verifies concurrent return race condition prevention (single return guarantee)", async () => {
      const komting = await createEphemeralKomting("race-ret");
      const { loanId, qrRaw } = await setupActiveLoan(komting, "race");

      const payload = {
        qr_payload: qrRaw,
        returned_by: "KOMTING",
        projector_condition: "NORMAL",
        accessories_condition: "COMPLETE",
      };

      // Fire two return requests concurrently
      const [resA, resB] = await Promise.all([
        apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
          method: "POST",
          token: staffToken,
          body: payload,
        }),
        apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
          method: "POST",
          token: staffToken,
          body: payload,
        }),
      ]);

      const statuses = [resA.status, resB.status];
      // Exactly one should succeed with 200; the other must fail with 409
      assert.ok(
        statuses.includes(200),
        `Expected at least one request to succeed with 200, got: ${statuses.join(", ")}`
      );
      assert.ok(
        statuses.includes(409),
        `Expected concurrent conflicting request to be rejected with 409, got: ${statuses.join(", ")}`
      );
    });

    it("10. verifies audit logs and transactional notification outbox consistency", async () => {
      const komting = await createEphemeralKomting("audit-ret");
      const { loanId, qrRaw } = await setupActiveLoan(komting, "audit");

      const returnRes = await apiFetch(`/api/v1/staff/loans/${loanId}/return`, {
        method: "POST",
        token: staffToken,
        body: {
          qr_payload: qrRaw,
          returned_by: "KOMTING",
          projector_condition: "NORMAL",
          accessories_condition: "COMPLETE",
        },
      });
      assert.strictEqual(returnRes.status, 200);

      // 1. Verify audit logs
      const { data: logs, error: lErr } = await admin
        .from("audit_logs")
        .select("action, entity_type, entity_id")
        .in("action", ["LOAN_RETURN_CONFIRMED", "LOAN_INSPECTED", "LOAN_FINE_RECORDED"]);

      assert.equal(lErr, null);
      const actions = (logs ?? []).map((l) => l.action);
      assert.ok(
        actions.includes("LOAN_RETURN_CONFIRMED"),
        "Must record LOAN_RETURN_CONFIRMED in audit_logs"
      );
      assert.ok(actions.includes("LOAN_INSPECTED"), "Must record LOAN_INSPECTED in audit_logs");
      assert.ok(
        actions.includes("LOAN_FINE_RECORDED"),
        "Must record LOAN_FINE_RECORDED in audit_logs"
      );

      // 2. Verify email outbox
      const { data: outbox, error: oErr } = await admin
        .from("email_outbox")
        .select("event_type, recipient, payload")
        .eq("deduplication_key", `loan_returned:${loanId}`)
        .maybeSingle();

      assert.equal(oErr, null);
      assert.ok(outbox, "Must insert LOAN_RETURNED email into email_outbox");
      assert.strictEqual(outbox.event_type, "LOAN_RETURNED");
      assert.strictEqual(outbox.recipient, komting.email);
    });
  }
);

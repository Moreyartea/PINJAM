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
import { getJakartaNowParts } from "@/lib/utils/jakarta-time";

loadEnvLocal();

const LIVE_ENABLED =
  process.env.PINJAM_RUN_LIVE_BE3_TESTS === "true" ||
  process.env.PINJAM_RUN_LIVE_AUTH_TESTS === "true";

interface LiveBe3Config {
  supabaseUrl: string;
  supabaseHost: string;
  anonKey: string;
  serviceRoleKey: string;
  testPassword: string | null;
  adminEmail: string;
}

function validateConfig(): LiveBe3Config {
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
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL for live BE-3 tests.");
  }
  const parsed = new URL(supabaseUrl);
  if (supabaseUrl.toLowerCase().includes("prod")) {
    throw new Error(`Refusing live test against production host: ${parsed.hostname}`);
  }
  if (!anonKey || !serviceRoleKey || anonKey === serviceRoleKey) {
    throw new Error("Invalid public/service role keys for live BE-3 tests.");
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

describe("Live BE-3 Integration Testing (PINJAM_TESTING)", { skip: !LIVE_ENABLED }, () => {
  const runId = crypto.randomUUID().slice(0, 8);
  let config: LiveBe3Config;
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  let serverHandle: { baseUrl: string; stop: () => Promise<void> } | null = null;
  let baseUrl = "";
  let staffToken = "";
  let komting1Token = "";
  let adminToken = "";
  let migration013Applied = false;

  const createdProjectorIds: string[] = [];
  const createdBookingIds: string[] = [];
  const createdOperatingHoursDates: string[] = [];
  const createdLoanIds: string[] = [];
  const createdMaintenanceRecordIds: string[] = [];

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

  async function apiFetch(
    pathname: string,
    init: { method?: string; token?: string; body?: unknown } = {}
  ) {
    const headers: Record<string, string> = {};
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
    komting1Token = await signInExisting("conc-komting1@example.test");
    adminToken = await signInExisting(config.adminEmail);

    const schemaRes = await fetch(`${config.supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    });
    const openapi = (await schemaRes.json()) as { paths?: Record<string, unknown> };
    const paths = openapi.paths ?? {};
    migration013Applied = Boolean(
      paths["/rpc/rpc_admin_upsert_operating_hours"] && paths["/rpc/rpc_admin_deactivate_projector"]
    );
  });

  after(async () => {
    try {
      if (admin) {
        for (const loanId of createdLoanIds) {
          await admin.from("loans").delete().eq("id", loanId);
        }
        for (const maintId of createdMaintenanceRecordIds) {
          await admin.from("maintenance_records").delete().eq("id", maintId);
        }
        for (const bookingId of createdBookingIds) {
          await admin.from("bookings").delete().eq("id", bookingId);
        }
        for (const date of createdOperatingHoursDates) {
          await admin.from("operating_hours").delete().eq("service_date", date);
        }
        for (const projId of createdProjectorIds) {
          await admin.from("projectors").delete().eq("id", projId);
        }
      }
    } finally {
      if (serverHandle) {
        await serverHandle.stop();
      }
    }
  });

  it("1. enforces authorization across BE-3 endpoints (401 unauth, 403 STAFF/KOMTING on ADMIN)", async () => {
    const fakeId = "11111111-1111-4111-8111-111111111111";

    for (const [method, pathName] of [
      ["GET", "/api/v1/projectors"],
      ["GET", `/api/v1/projectors/${fakeId}`],
      ["POST", "/api/v1/admin/projectors"],
      ["PATCH", `/api/v1/admin/projectors/${fakeId}`],
      ["POST", `/api/v1/admin/projectors/${fakeId}/deactivate`],
      ["GET", "/api/v1/operating-hours?date=2026-11-27"],
      ["PUT", "/api/v1/admin/operating-hours/2026-11-27"],
      ["GET", `/api/v1/availability?projector_id=${fakeId}&date=2026-11-27`],
    ] as const) {
      const res = await apiFetch(pathName, { method });
      assert.equal(res.status, 401, `Expected 401 on ${method} ${pathName}`);
    }

    for (const token of [staffToken, komting1Token]) {
      const r1 = await apiFetch("/api/v1/admin/projectors", {
        method: "POST",
        token,
        body: { asset_code: `PRJ-UNAUTH-${runId}`, name: "Unauthorized" },
      });
      assert.equal(r1.status, 403);

      const r2 = await apiFetch(`/api/v1/admin/projectors/${fakeId}`, {
        method: "PATCH",
        token,
        body: { name: "Unauthorized" },
      });
      assert.equal(r2.status, 403);

      const r3 = await apiFetch(`/api/v1/admin/projectors/${fakeId}/deactivate`, {
        method: "POST",
        token,
      });
      assert.equal(r3.status, 403);

      const r4 = await apiFetch("/api/v1/admin/operating-hours/2026-11-27", {
        method: "PUT",
        token,
        body: {
          opens_at: "08:00:00",
          closes_at: "17:00:00",
          admin_early_open_at: null,
          note: null,
        },
      });
      assert.equal(r4.status, 403);
    }
  });

  it("2. manages projectors live (create, list, detail, patch, duplicate asset_code, and deactivate if migration 013 applied)", async () => {
    const assetCode = `PRJ-LIVE-${runId}`;
    const createRes = await apiFetch("/api/v1/admin/projectors", {
      method: "POST",
      token: adminToken,
      body: { asset_code: assetCode, name: "Live Test Projector", brand: "Epson", model: "X500" },
    });
    assert.equal(createRes.status, 201);
    const createBody = (await createRes.json()) as {
      data: { id: string; asset_code: string; physical_status: string; is_active: boolean };
    };
    const projectorId = createBody.data.id;
    createdProjectorIds.push(projectorId);
    assert.equal(createBody.data.asset_code, assetCode);
    assert.equal(createBody.data.physical_status, "AVAILABLE");

    // Duplicate asset code rejected with 409
    const dupRes = await apiFetch("/api/v1/admin/projectors", {
      method: "POST",
      token: adminToken,
      body: { asset_code: assetCode.toLowerCase(), name: "Dup" },
    });
    assert.equal(dupRes.status, 409);

    // KOMTING list omits created_at, STAFF detail includes operational flags
    const listRes = await apiFetch("/api/v1/projectors?page_size=50", { token: komting1Token });
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as {
      data: Array<Record<string, unknown> & { id: string }>;
    };
    const item = listBody.data.find((p) => p.id === projectorId);
    assert.ok(item);
    assert.equal("created_at" in item, false);

    const detailStaffRes = await apiFetch(`/api/v1/projectors/${projectorId}`, {
      token: staffToken,
    });
    assert.equal(detailStaffRes.status, 200);
    const detailStaffBody = (await detailStaffRes.json()) as {
      data: { id: string; has_active_loan: boolean };
    };
    assert.equal(detailStaffBody.data.has_active_loan, false);

    // PATCH updates allowed fields cleanly
    const patchRes = await apiFetch(`/api/v1/admin/projectors/${projectorId}`, {
      method: "PATCH",
      token: adminToken,
      body: { name: `Live Updated ${runId}`, model: "X510" },
    });
    assert.equal(patchRes.status, 200);

    // Check GET /api/v1/operating-hours & GET /api/v1/availability for tomorrow
    const { tomorrow } = getJakartaNowParts();
    const hoursRes = await apiFetch(`/api/v1/operating-hours?date=${tomorrow}`, {
      token: komting1Token,
    });
    assert.equal(hoursRes.status, 200);

    const availRes = await apiFetch(
      `/api/v1/availability?projector_id=${projectorId}&date=${tomorrow}`,
      { token: komting1Token }
    );
    assert.equal(availRes.status, 200);
    const availBody = (await availRes.json()) as {
      data: { is_bookable: boolean; physical_status: string };
    };
    assert.equal(availBody.data.is_bookable, true);
    assert.equal(availBody.data.physical_status, "AVAILABLE");

    if (migration013Applied) {
      const deactRes = await apiFetch(`/api/v1/admin/projectors/${projectorId}/deactivate`, {
        method: "POST",
        token: adminToken,
        body: { reason: "Live BE-3 deactivation test" },
      });
      assert.equal(deactRes.status, 200);
      const deactBody = (await deactRes.json()) as {
        data: { physical_status: string; is_active: boolean };
      };
      assert.equal(deactBody.data.physical_status, "INACTIVE");
      assert.equal(deactBody.data.is_active, false);

      const availAfterDeact = await apiFetch(
        `/api/v1/availability?projector_id=${projectorId}&date=${tomorrow}`,
        { token: komting1Token }
      );
      assert.equal(availAfterDeact.status, 200);
      const availAfterBody = (await availAfterDeact.json()) as { data: { is_bookable: boolean } };
      assert.equal(availAfterBody.data.is_bookable, false);

      // Attempting to deactivate an already INACTIVE projector returns 409 PROJECTOR_ALREADY_INACTIVE
      const deactAgain = await apiFetch(`/api/v1/admin/projectors/${projectorId}/deactivate`, {
        method: "POST",
        token: adminToken,
      });
      assert.equal(deactAgain.status, 409);
      const deactAgainBody = (await deactAgain.json()) as { error: { code: string } };
      assert.equal(deactAgainBody.error.code, "PROJECTOR_ALREADY_INACTIVE");

      // Attempting to deactivate a projector under MAINTENANCE returns 409 PROJECTOR_HAS_ACTIVE_MAINTENANCE
      const { data: maintProj } = await admin
        .from("projectors")
        .insert({
          asset_code: `PRJ-MAINT-${runId}`,
          name: "Maint Projector",
          physical_status: "MAINTENANCE",
          is_active: true,
        })
        .select("id")
        .single();
      assert.ok(maintProj);
      createdProjectorIds.push(maintProj.id);

      const deactMaint = await apiFetch(`/api/v1/admin/projectors/${maintProj.id}/deactivate`, {
        method: "POST",
        token: adminToken,
      });
      assert.equal(deactMaint.status, 409);
      const deactMaintBody = (await deactMaint.json()) as { error: { code: string } };
      assert.equal(deactMaintBody.error.code, "PROJECTOR_HAS_ACTIVE_MAINTENANCE");

      // Attempting to deactivate a projector with an ACTIVE loan returns 409 PROJECTOR_HAS_ACTIVE_LOAN
      const { data: activeLoan } = await admin
        .from("loans")
        .select("projector_id")
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (activeLoan?.projector_id) {
        const deactBorrow = await apiFetch(
          `/api/v1/admin/projectors/${activeLoan.projector_id}/deactivate`,
          {
            method: "POST",
            token: adminToken,
          }
        );
        assert.equal(deactBorrow.status, 409);
        const deactBorrowBody = (await deactBorrow.json()) as { error: { code: string } };
        assert.equal(deactBorrowBody.error.code, "PROJECTOR_HAS_ACTIVE_LOAN");
      }
    }
  });

  it("3. verifies PUT operating hours & conflict detection against CONFIRMED booking when migration 013 is applied", async (t) => {
    if (!migration013Applied) {
      t.skip("Migration 013 not yet applied on PINJAM_TESTING");
      return;
    }

    const { tomorrow } = getJakartaNowParts();
    const customDate = `2027-01-15`;
    createdOperatingHoursDates.push(customDate);

    const putRes = await apiFetch(`/api/v1/admin/operating-hours/${customDate}`, {
      method: "PUT",
      token: adminToken,
      body: {
        opens_at: "08:00:00",
        closes_at: "18:00:00",
        admin_early_open_at: "07:00:00",
        note: `Live BE-3 hours ${runId}`,
      },
    });
    assert.equal(putRes.status, 200);
    const putBody = (await putRes.json()) as {
      data: { closes_at: string; early_pickup_allowed_at: string };
    };
    assert.equal(putBody.data.closes_at, "18:00:00");
    assert.equal(putBody.data.early_pickup_allowed_at, "07:30:00");

    // Verify conflict detection against CONFIRMED booking on customDate
    const { data: komtingUser } = await admin
      .from("users")
      .select("id")
      .eq("email", "conc-komting1@example.test")
      .single();
    const { data: proj } = await admin
      .from("projectors")
      .insert({
        asset_code: `PRJ-OH-${runId}`,
        name: "OH Conflict Projector",
        physical_status: "AVAILABLE",
        is_active: true,
      })
      .select("id")
      .single();
    assert.ok(komtingUser && proj);
    createdProjectorIds.push(proj.id);

    const { data: bkg, error: bErr } = await admin
      .from("bookings")
      .insert({
        booking_code: `BKG-LIVE-OH-${runId}`,
        komting_id: komtingUser.id,
        projector_id: proj.id,
        booking_date: tomorrow,
        start_time: "10:00:00",
        start_at: `${tomorrow}T03:00:00.000Z`,
        estimated_return_at: `${tomorrow}T09:00:00.000Z`, // 16:00 WIB
        status: "CONFIRMED",
        operating_hours_snapshot: {
          opens_at: "08:00:00",
          closes_at: "17:00:00",
        },
        pickup_window_start_at: `${tomorrow}T02:30:00.000Z`,
        pickup_window_end_at: `${tomorrow}T03:15:00.000Z`,
      })
      .select("id")
      .single();
    assert.equal(bErr, null);
    assert.ok(bkg);
    createdBookingIds.push(bkg.id);
    createdOperatingHoursDates.push(tomorrow);

    // Verify deactivating a projector with a CONFIRMED booking is rejected with 409 PROJECTOR_HAS_CONFIRMED_BOOKINGS
    const deactConfirmed = await apiFetch(`/api/v1/admin/projectors/${proj.id}/deactivate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(deactConfirmed.status, 409);
    const deactConfirmedBody = (await deactConfirmed.json()) as { error: { code: string } };
    assert.equal(deactConfirmedBody.error.code, "PROJECTOR_HAS_CONFIRMED_BOOKINGS");

    const conflictPut = await apiFetch(`/api/v1/admin/operating-hours/${tomorrow}`, {
      method: "PUT",
      token: adminToken,
      body: {
        opens_at: "08:00:00",
        closes_at: "15:00:00",
        admin_early_open_at: null,
        note: "Narrow window conflict test",
      },
    });
    assert.equal(conflictPut.status, 409);
    const conflictBody = (await conflictPut.json()) as { error: { code: string } };
    assert.equal(conflictBody.error.code, "OPERATING_HOURS_CONFLICT");
  });
});

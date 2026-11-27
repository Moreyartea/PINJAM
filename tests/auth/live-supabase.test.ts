import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "../../scripts/load-env-local.mjs";
import { GET as sessionGetRoute } from "@/app/api/v1/auth/session/route";
import { POST as logoutPostRoute } from "@/app/api/v1/auth/logout/route";
import { AuthError } from "@/lib/auth/errors";
import {
  requireActiveKomting,
  requireAdmin,
  requireAuthenticatedUser,
  requireStaffOrAdmin,
} from "@/lib/auth/guards";
import { getServerSessionContext } from "@/lib/auth/session";
import { isValidHttpUrl } from "@/lib/config/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

loadEnvLocal();

const LIVE_ENABLED = process.env.PINJAM_RUN_LIVE_AUTH_TESTS === "true";

interface LiveTestConfig {
  supabaseUrl: string;
  supabaseHost: string;
  anonKey: string;
  serviceRoleKey: string;
  password: string;
  adminEmail: string;
}

function validateAndGetLiveConfig(): LiveTestConfig {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const password = process.env.PINJAM_TEST_USER_PASSWORD ?? "";
  const adminEmail = (process.env.PINJAM_TEST_ADMIN_EMAIL ?? "conc-admin@example.test")
    .trim()
    .toLowerCase();

  if (!isValidHttpUrl(supabaseUrl)) {
    throw new Error(
      "Missing or invalid NEXT_PUBLIC_SUPABASE_URL for live test. Check .env.local for PINJAM_TESTING."
    );
  }

  const parsedUrl = new URL(supabaseUrl);
  if (supabaseUrl.toLowerCase().includes("prod")) {
    throw new Error(
      `Refusing to run live auth tests against production-like host: ${parsedUrl.hostname}`
    );
  }

  if (!parsedUrl.hostname.endsWith(".supabase.co") && parsedUrl.hostname !== "127.0.0.1") {
    throw new Error(
      `Unexpected NEXT_PUBLIC_SUPABASE_URL host (${parsedUrl.hostname}). Expected PINJAM_TESTING *.supabase.co project.`
    );
  }

  if (!anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in .env.local or environment."
    );
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local or environment.");
  }

  if (anonKey === serviceRoleKey) {
    throw new Error(
      "Configuration error: public anon/publishable key must not match SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  if (password.length < 12) {
    throw new Error("PINJAM_TEST_USER_PASSWORD (>= 12 chars) is required for live auth tests.");
  }

  return {
    supabaseUrl,
    supabaseHost: parsedUrl.hostname,
    anonKey,
    serviceRoleKey,
    password,
    adminEmail,
  };
}

describe("Live Supabase Auth integration (PINJAM_TESTING)", { skip: !LIVE_ENABLED }, () => {
  let config: LiveTestConfig;
  let staffToken = "";
  let komting1Token = "";
  let komting2Token = "";
  let adminToken = "";
  const ephemeralAuthIds: string[] = [];
  const ephemeralUserIds: string[] = [];

  function makeAnonClient() {
    return createClient<Database>(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async function signInLive(email: string, pwd: string) {
    const client = makeAnonClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password: pwd });
    if (error && error.name === "AuthRetryableFetchError") {
      const cause = (error as { cause?: unknown }).cause;
      const causeDetail = cause instanceof Error ? cause.message : "";
      throw new Error(
        `Supabase Auth fetch failed against host ${config.supabaseHost} (status=${error.status}): ${error.message}${causeDetail ? ` (${causeDetail})` : ""}`
      );
    }
    return { data, error };
  }

  before(async () => {
    config = validateAndGetLiveConfig();

    const staffLogin = await signInLive("conc-staff@example.test", config.password);
    assert.equal(staffLogin.error, null, `STAFF login failed: ${staffLogin.error?.message}`);
    staffToken = staffLogin.data.session?.access_token ?? "";
    assert.ok(staffToken);

    const k1Login = await signInLive("conc-komting1@example.test", config.password);
    assert.equal(k1Login.error, null, `KOMTING 1 login failed: ${k1Login.error?.message}`);
    komting1Token = k1Login.data.session?.access_token ?? "";
    assert.ok(komting1Token);

    const k2Login = await signInLive("conc-komting2@example.test", config.password);
    assert.equal(k2Login.error, null, `KOMTING 2 login failed: ${k2Login.error?.message}`);
    komting2Token = k2Login.data.session?.access_token ?? "";
    assert.ok(komting2Token);

    const adminLogin = await signInLive(config.adminEmail, config.password);
    assert.equal(adminLogin.error, null, `ADMIN login failed: ${adminLogin.error?.message}`);
    adminToken = adminLogin.data.session?.access_token ?? "";
    assert.ok(adminToken);
  });

  after(async () => {
    if (ephemeralUserIds.length === 0 && ephemeralAuthIds.length === 0) return;
    const admin = createSupabaseAdminClient();
    for (const userId of ephemeralUserIds) {
      await admin.from("komting_assignments").delete().eq("user_id", userId);
      await admin.from("users").delete().eq("id", userId);
    }
    for (const authId of ephemeralAuthIds) {
      await admin.auth.admin.deleteUser(authId);
    }
  });

  it("rejects wrong password login", async () => {
    const wrong = await signInLive("conc-staff@example.test", `${config.password}-wrong`);
    assert.ok(wrong.error);
    assert.equal(wrong.data.session, null);
  });

  it("retrieves authenticated STAFF, KOMTING, and ADMIN sessions linked to public.users", async () => {
    const staffReq = new Request("http://localhost:3000/api/v1/auth/session", {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const staffRes = await sessionGetRoute(staffReq);
    assert.equal(staffRes.status, 200);
    const staffBody = (await staffRes.json()) as {
      data: { authenticated: boolean; user: { email: string; role: string } };
    };
    assert.equal(staffBody.data.authenticated, true);
    assert.equal(staffBody.data.user.email, "conc-staff@example.test");
    assert.equal(staffBody.data.user.role, "STAFF");

    const k1Session = await getServerSessionContext(
      new Request("http://localhost:3000/api/v1/auth/session", {
        headers: { Authorization: `Bearer ${komting1Token}` },
      })
    );
    assert.equal(k1Session.authenticated, true);
    assert.equal(k1Session.context.user.role, "KOMTING");
    assert.equal(k1Session.context.komtingAssignment?.status, "ACTIVE");

    const adminSession = await getServerSessionContext(
      new Request("http://localhost:3000/api/v1/auth/session", {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );
    assert.equal(adminSession.authenticated, true);
    assert.equal(adminSession.context.user.role, "ADMIN");
  });

  it("enforces role guards and active KOMTING assignment checks", async () => {
    const staffReq = new Request("http://localhost:3000/api/v1/staff/dashboard", {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const k1Req = new Request("http://localhost:3000/api/v1/bookings", {
      headers: { Authorization: `Bearer ${komting1Token}` },
    });
    const k2Req = new Request("http://localhost:3000/api/v1/bookings", {
      headers: { Authorization: `Bearer ${komting2Token}` },
    });
    const adminReq = new Request("http://localhost:3000/api/v1/admin/audit-logs", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    await requireStaffOrAdmin(staffReq);
    await requireStaffOrAdmin(adminReq);
    await requireAdmin(adminReq);

    await assert.rejects(
      () => requireAdmin(staffReq),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );
    await assert.rejects(
      () => requireStaffOrAdmin(k1Req),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );

    const k1Ctx = await requireActiveKomting(k1Req);
    const k2Ctx = await requireActiveKomting(k2Req);
    assert.notEqual(
      k1Ctx.komtingAssignment.class_name,
      k2Ctx.komtingAssignment.class_name,
      "Test KOMTING accounts must represent distinct classes"
    );
  });

  it("links unlinked public.users automatically on confirmed login and rejects KOMTING without active assignment", async () => {
    const admin = createSupabaseAdminClient();
    const suffix = crypto.randomUUID().slice(0, 8);
    const tempEmail = `live-ephemeral-${suffix}@example.test`;

    const { data: adminProfile } = await admin
      .from("users")
      .select("id")
      .ilike("email", config.adminEmail)
      .single();
    assert.ok(adminProfile);

    const { data: createdUser, error: uErr } = await admin
      .from("users")
      .insert({
        email: tempEmail,
        full_name: "Ephemeral Komting",
        role: "KOMTING",
        account_status: "ACTIVE",
        auth_provider_user_id: null,
      })
      .select("id")
      .single();
    assert.equal(uErr, null);
    assert.ok(createdUser);
    ephemeralUserIds.push(createdUser.id);

    const { data: createdAuth, error: aErr } = await admin.auth.admin.createUser({
      email: tempEmail,
      password: config.password,
      email_confirm: true,
    });
    assert.equal(aErr, null);
    assert.ok(createdAuth.user);
    ephemeralAuthIds.push(createdAuth.user.id);

    const loginRes = await signInLive(tempEmail, config.password);
    assert.equal(loginRes.error, null);
    const jwt = loginRes.data.session?.access_token ?? "";
    assert.ok(jwt);

    const req = new Request("http://localhost:3000/api/v1/bookings", {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    // No assignment -> requireAuthenticatedUser passes, requireActiveKomting rejects 403 KOMTING_ASSIGNMENT_REQUIRED
    const authCtx = await requireAuthenticatedUser(req);
    assert.equal(authCtx.rawUser.auth_provider_user_id, createdAuth.user.id);

    await assert.rejects(
      () => requireActiveKomting(req),
      (err: unknown) =>
        err instanceof AuthError && err.status === 403 && err.code === "KOMTING_ASSIGNMENT_REQUIRED"
    );

    // Add INACTIVE assignment -> still rejected
    await admin.from("komting_assignments").insert({
      user_id: createdUser.id,
      class_name: `IF-INACT-${suffix}`,
      status: "INACTIVE",
      started_at: new Date(Date.now() - 60000).toISOString(),
      ended_at: new Date().toISOString(),
      created_by: adminProfile.id,
      ended_by: adminProfile.id,
      end_reason: "Live test inactive assignment",
    });

    await assert.rejects(
      () => requireActiveKomting(req),
      (err: unknown) =>
        err instanceof AuthError && err.status === 403 && err.code === "KOMTING_ASSIGNMENT_REQUIRED"
    );
  });

  it("invalidates Bearer session after logout", async () => {
    const loginRes = await signInLive("conc-staff@example.test", config.password);
    assert.equal(loginRes.error, null);
    const disposableToken = loginRes.data.session?.access_token ?? "";
    assert.ok(disposableToken);

    const beforeLogoutReq = new Request("http://localhost:3000/api/v1/auth/session", {
      headers: { Authorization: `Bearer ${disposableToken}` },
    });
    const beforeRes = await sessionGetRoute(beforeLogoutReq);
    assert.equal(beforeRes.status, 200);

    const logoutReq = new Request("http://localhost:3000/api/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${disposableToken}` },
    });
    const logoutRes = await logoutPostRoute(logoutReq);
    assert.equal(logoutRes.status, 200);

    const afterLogoutReq = new Request("http://localhost:3000/api/v1/auth/session", {
      headers: { Authorization: `Bearer ${disposableToken}` },
    });
    const afterRes = await sessionGetRoute(afterLogoutReq);
    assert.equal(afterRes.status, 401);
  });
});

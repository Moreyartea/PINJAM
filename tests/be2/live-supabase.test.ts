import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "../../scripts/load-env-local.mjs";
import { AuthError } from "@/lib/auth/errors";
import { requireActiveKomting } from "@/lib/auth/guards";
import { isValidHttpUrl } from "@/lib/config/env";
import { submitKomtingApplication } from "@/lib/komting/komting-service";
import { createSupabaseIdentityStorageAdapter } from "@/lib/storage/identity-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

loadEnvLocal();

const LIVE_ENABLED =
  process.env.PINJAM_RUN_LIVE_BE2_TESTS === "true" ||
  process.env.PINJAM_RUN_LIVE_AUTH_TESTS === "true";

interface LiveBe2Config {
  supabaseUrl: string;
  supabaseHost: string;
  anonKey: string;
  serviceRoleKey: string;
  bucketName: string;
  testPassword: string | null;
  adminEmail: string;
}

function validateAndGetConfig(): LiveBe2Config {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const bucketName = (process.env.SUPABASE_IDENTITY_BUCKET ?? "").trim() || "identity-photos";
  const testPassword = (process.env.PINJAM_TEST_USER_PASSWORD ?? "").trim() || null;
  const adminEmail = (process.env.PINJAM_TEST_ADMIN_EMAIL ?? "conc-admin@example.test")
    .trim()
    .toLowerCase();

  if (!isValidHttpUrl(supabaseUrl)) {
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL for live BE-2 tests.");
  }

  const parsedUrl = new URL(supabaseUrl);
  if (supabaseUrl.toLowerCase().includes("prod")) {
    throw new Error(
      `Refusing to run live BE-2 tests against production-like host: ${parsedUrl.hostname}`
    );
  }

  if (!parsedUrl.hostname.endsWith(".supabase.co") && parsedUrl.hostname !== "127.0.0.1") {
    throw new Error(
      `Unexpected NEXT_PUBLIC_SUPABASE_URL host (${parsedUrl.hostname}). Expected PINJAM_TESTING.`
    );
  }

  if (!anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in server environment.");
  }

  if (anonKey === serviceRoleKey) {
    throw new Error("Public key and SUPABASE_SERVICE_ROLE_KEY must not match.");
  }

  return {
    supabaseUrl,
    supabaseHost: parsedUrl.hostname,
    anonKey,
    serviceRoleKey,
    bucketName,
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
        srv.close(() => reject(new Error("Could not acquire free ephemeral port.")));
        return;
      }
      const { port } = address;
      srv.close(() => resolve(port));
    });
  });
}

async function startLiveNextServer(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const configuredBaseUrl = (process.env.PINJAM_LIVE_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (configuredBaseUrl) {
    return {
      baseUrl: configuredBaseUrl,
      stop: async () => {},
    };
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
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-2000);
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited prematurely (${child.exitCode}): ${stderrTail}`);
    }
    try {
      const probe = await fetch(`${baseUrl}/api/v1/auth/session`);
      if (probe.ok || probe.status === 401) {
        return {
          baseUrl,
          stop: async () => {
            if (child.exitCode !== null) return;
            child.kill("SIGTERM");
            await new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                if (child.exitCode === null) {
                  child.kill("SIGKILL");
                }
                resolve();
              }, 3000);
              child.once("exit", () => {
                clearTimeout(timer);
                resolve();
              });
            });
          },
        };
      }
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  child.kill("SIGKILL");
  throw new Error(`Timed out waiting for live Next.js server at ${baseUrl}: ${stderrTail}`);
}

function makeJpegFile(name = "id-card.jpg"): File {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  return new File([bytes], name, { type: "image/jpeg" });
}

function makePngFile(name = "id-card.png"): File {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  return new File([bytes], name, { type: "image/png" });
}

function makeWebpFile(name = "id-card.webp"): File {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);
  return new File([bytes], name, { type: "image/webp" });
}

describe("Live BE-2 Integration Testing (PINJAM_TESTING)", { skip: !LIVE_ENABLED }, () => {
  const runId = crypto.randomUUID().slice(0, 8);
  let config: LiveBe2Config;
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  let serverHandle: { baseUrl: string; stop: () => Promise<void> } | null = null;
  let baseUrl = "";

  // Pre-existing test account tokens (never mutated!)
  let staffToken = "";
  let komting1Token = "";
  let komting2Token = "";
  let adminToken = "";

  // Ephemeral test accounts & tracked records for targeted cleanup
  const ephemeralUsers: Array<{
    userId: string;
    authId: string;
    email: string;
    token: string;
    hadAuditLogs?: boolean;
  }> = [];
  const createdApplicationIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const createdStorageKeys: string[] = [];
  const createdOutboxDedupKeys: string[] = [];

  function makeAnonClient() {
    return createClient<Database>(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async function signInExistingUser(email: string): Promise<string> {
    const anon = makeAnonClient();

    if (config.testPassword) {
      const { data, error } = await anon.auth.signInWithPassword({
        email,
        password: config.testPassword,
      });
      if (!error && data.session?.access_token) {
        return data.session.access_token;
      }
    }

    // Without mutating password/role/status, generate a one-time magiclink OTP and verify it.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    assert.equal(linkErr, null, `generateLink failed for ${email}: ${linkErr?.message}`);
    const tokenHash = linkData?.properties?.hashed_token;
    assert.ok(tokenHash, `Missing hashed_token from generateLink for ${email}`);

    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    assert.equal(verifyErr, null, `verifyOtp failed for ${email}: ${verifyErr?.message}`);
    const jwt = verified.session?.access_token ?? "";
    assert.ok(jwt, `Missing access_token for ${email}`);
    return jwt;
  }

  async function createEphemeralKomtingUser(params: {
    tag: string;
    fullName: string;
    accountStatus?: "ACTIVE" | "INACTIVE";
  }) {
    const email = `be2-live-${runId}-${params.tag}@example.test`;
    const ephemeralPwd = `${crypto.randomUUID()}Aa1!`;

    const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: ephemeralPwd,
      email_confirm: true,
    });
    assert.equal(authErr, null, `createUser auth failed (${params.tag}): ${authErr?.message}`);
    assert.ok(authCreated.user);

    const { data: dbCreated, error: dbErr } = await admin
      .from("users")
      .insert({
        email,
        full_name: params.fullName,
        role: "KOMTING",
        account_status: params.accountStatus ?? "ACTIVE",
        auth_provider_user_id: authCreated.user.id,
      })
      .select("*")
      .single();
    assert.equal(dbErr, null, `insert public.users failed (${params.tag}): ${dbErr?.message}`);
    assert.ok(dbCreated);

    const anon = makeAnonClient();
    const { data: loginData, error: loginErr } = await anon.auth.signInWithPassword({
      email,
      password: ephemeralPwd,
    });
    assert.equal(loginErr, null, `ephemeral login failed (${params.tag}): ${loginErr?.message}`);
    const token = loginData.session?.access_token ?? "";
    assert.ok(token);

    const entry = {
      userId: dbCreated.id,
      authId: authCreated.user.id,
      email,
      token,
      hadAuditLogs: false,
    };
    ephemeralUsers.push(entry);
    return entry;
  }

  async function apiFetch(
    pathname: string,
    init: {
      method?: string;
      token?: string;
      headers?: Record<string, string>;
      body?: BodyInit | null;
    } = {}
  ) {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.token) {
      headers.Authorization = `Bearer ${init.token}`;
    }
    return fetch(`${baseUrl}${pathname}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
    });
  }

  before(async () => {
    config = validateAndGetConfig();
    admin = createSupabaseAdminClient();
    serverHandle = await startLiveNextServer();
    baseUrl = serverHandle.baseUrl;

    staffToken = await signInExistingUser("conc-staff@example.test");
    komting1Token = await signInExistingUser("conc-komting1@example.test");
    komting2Token = await signInExistingUser("conc-komting2@example.test");
    adminToken = await signInExistingUser(config.adminEmail);
  });

  after(async () => {
    try {
      if (admin) {
        // 1. Delete uploaded storage objects created during this live run
        if (createdStorageKeys.length > 0) {
          await admin.storage.from(config.bucketName).remove(createdStorageKeys);
        }

        // 2. Delete ephemeral komting_assignments first (FK references users)
        for (const assignId of createdAssignmentIds) {
          await admin.from("komting_assignments").delete().eq("id", assignId);
        }

        // 3. Delete ephemeral komting_applications
        for (const appId of createdApplicationIds) {
          await admin.from("komting_applications").delete().eq("id", appId);
        }

        // 4. Delete ephemeral email_outbox rows
        if (createdOutboxDedupKeys.length > 0) {
          await admin.from("email_outbox").delete().in("deduplication_key", createdOutboxDedupKeys);
        }

        // 5. Delete ephemeral users when possible; if referenced by append-only audit_logs, deactivate & unlink.
        for (const user of ephemeralUsers) {
          await admin.from("komting_assignments").delete().eq("user_id", user.userId);
          await admin.from("komting_applications").delete().eq("user_id", user.userId);

          if (!user.hadAuditLogs) {
            const { error: delErr } = await admin.from("users").delete().eq("id", user.userId);
            if (!delErr) {
              await admin.auth.admin.deleteUser(user.authId);
              continue;
            }
          }

          await admin
            .from("users")
            .update({ account_status: "INACTIVE", auth_provider_user_id: null })
            .eq("id", user.userId);
          await admin.auth.admin.deleteUser(user.authId);
        }
      }
    } finally {
      if (serverHandle) {
        await serverHandle.stop();
      }
    }
  });

  it("1. verifies PINJAM_TESTING env, private bucket identity-photos, and migration 012 RPCs", async () => {
    assert.ok(config.supabaseHost.endsWith(".supabase.co") || config.supabaseHost === "127.0.0.1");
    assert.ok(!config.supabaseHost.includes("prod"));

    const { data: bucket, error: bucketErr } = await admin.storage.getBucket(config.bucketName);
    assert.equal(
      bucketErr,
      null,
      `Bucket ${config.bucketName} lookup failed: ${bucketErr?.message}`
    );
    assert.ok(bucket);
    assert.equal(bucket.public, false);
    assert.equal(bucket.file_size_limit, 5 * 1024 * 1024);
    assert.ok(bucket.allowed_mime_types?.includes("image/jpeg"));
    assert.ok(bucket.allowed_mime_types?.includes("image/png"));
    assert.ok(bucket.allowed_mime_types?.includes("image/webp"));

    const schemaRes = await fetch(`${config.supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    });
    assert.equal(schemaRes.status, 200);
    const openapi = (await schemaRes.json()) as { paths?: Record<string, unknown> };
    const paths = openapi.paths ?? {};
    for (const rpcName of [
      "/rpc/rpc_admin_approve_komting_application",
      "/rpc/rpc_admin_reject_komting_application",
      "/rpc/rpc_admin_approve_komting_replacement",
      "/rpc/rpc_admin_deactivate_komting_assignment",
    ]) {
      assert.ok(paths[rpcName], `Expected migration 012 RPC path missing: ${rpcName}`);
    }

    // Verify anon client cannot execute admin RPC directly
    const anon = makeAnonClient();
    const { error: rpcAnonErr } = await anon.rpc("rpc_admin_approve_komting_application", {
      p_application_id: "11111111-1111-4111-8111-111111111111",
      p_admin_user_id: "11111111-1111-4111-8111-111111111111",
    });
    assert.ok(rpcAnonErr, "Anon client must not be permitted to execute migration 012 RPC");
  });

  it("2. enforces authorization boundaries across all 10 BE-2 endpoints (401, INACTIVE, STAFF, KOMTING, ADMIN, no-assignment)", async () => {
    const fakeId = "11111111-1111-4111-8111-111111111111";
    const endpoints: Array<{ path: string; method: "GET" | "POST" | "PATCH"; adminOnly: boolean }> =
      [
        { path: "/api/v1/me", method: "GET", adminOnly: false },
        { path: "/api/v1/me", method: "PATCH", adminOnly: false },
        { path: "/api/v1/komting/applications", method: "POST", adminOnly: false },
        { path: "/api/v1/komting/applications/me", method: "GET", adminOnly: false },
        { path: "/api/v1/admin/komting/applications", method: "GET", adminOnly: true },
        { path: `/api/v1/admin/komting/applications/${fakeId}`, method: "GET", adminOnly: true },
        {
          path: `/api/v1/admin/komting/applications/${fakeId}/approve`,
          method: "POST",
          adminOnly: true,
        },
        {
          path: `/api/v1/admin/komting/applications/${fakeId}/reject`,
          method: "POST",
          adminOnly: true,
        },
        {
          path: `/api/v1/admin/komting/applications/${fakeId}/approve-replacement`,
          method: "POST",
          adminOnly: true,
        },
        {
          path: `/api/v1/admin/komting/assignments/${fakeId}/deactivate`,
          method: "POST",
          adminOnly: true,
        },
      ];

    // Unauthenticated -> 401 AUTH_REQUIRED on all 10 endpoints
    for (const ep of endpoints) {
      const res = await apiFetch(ep.path, { method: ep.method });
      assert.equal(res.status, 401, `Expected 401 on unauthenticated ${ep.method} ${ep.path}`);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "AUTH_REQUIRED");
    }

    // INACTIVE ephemeral account -> 403 ACCOUNT_NOT_ACTIVE on protected endpoints
    const inactiveUser = await createEphemeralKomtingUser({
      tag: "inactive",
      fullName: "Live Test Inactive Komting",
      accountStatus: "INACTIVE",
    });

    for (const ep of endpoints) {
      const res = await apiFetch(ep.path, { method: ep.method, token: inactiveUser.token });
      assert.equal(
        res.status,
        403,
        `Expected 403 ACCOUNT_NOT_ACTIVE for INACTIVE user on ${ep.method} ${ep.path}`
      );
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "ACCOUNT_NOT_ACTIVE");
    }

    // STAFF cannot access KOMTING-only or ADMIN-only endpoints
    const staffAppRes = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: staffToken,
    });
    assert.equal(staffAppRes.status, 403);
    assert.equal(
      ((await staffAppRes.json()) as { error: { code: string } }).error.code,
      "FORBIDDEN"
    );

    const staffMyAppRes = await apiFetch("/api/v1/komting/applications/me", {
      method: "GET",
      token: staffToken,
    });
    assert.equal(staffMyAppRes.status, 403);

    for (const ep of endpoints.filter((e) => e.adminOnly)) {
      const staffAdminRes = await apiFetch(ep.path, { method: ep.method, token: staffToken });
      assert.equal(staffAdminRes.status, 403, `STAFF must receive 403 on ${ep.method} ${ep.path}`);
      assert.equal(
        ((await staffAdminRes.json()) as { error: { code: string } }).error.code,
        "FORBIDDEN"
      );

      const komtingAdminRes = await apiFetch(ep.path, {
        method: ep.method,
        token: komting1Token,
      });
      assert.equal(
        komtingAdminRes.status,
        403,
        `KOMTING must receive 403 on ${ep.method} ${ep.path}`
      );
      assert.equal(
        ((await komtingAdminRes.json()) as { error: { code: string } }).error.code,
        "FORBIDDEN"
      );
    }

    // ADMIN succeeds on ADMIN list endpoint
    const adminListRes = await apiFetch("/api/v1/admin/komting/applications", {
      method: "GET",
      token: adminToken,
    });
    assert.equal(adminListRes.status, 200);

    // Ephemeral KOMTING without active assignment cannot pass requireActiveKomting
    const noAssignUser = await createEphemeralKomtingUser({
      tag: "noassign",
      fullName: "Live Test No Assignment",
    });
    await assert.rejects(
      () =>
        requireActiveKomting(
          new Request(`${baseUrl}/api/v1/bookings`, {
            headers: { Authorization: `Bearer ${noAssignUser.token}` },
          })
        ),
      (err: unknown) =>
        err instanceof AuthError && err.status === 403 && err.code === "KOMTING_ASSIGNMENT_REQUIRED"
    );
  });

  it("3. executes live GET/PATCH /api/v1/me and rejects mass assignment", async () => {
    // Existing STAFF, KOMTING, ADMIN GET /api/v1/me
    for (const [token, expectedRole] of [
      [staffToken, "STAFF"],
      [komting1Token, "KOMTING"],
      [adminToken, "ADMIN"],
    ] as const) {
      const res = await apiFetch("/api/v1/me", { method: "GET", token });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: Record<string, unknown> & { role: string; account_status: string };
      };
      assert.equal(body.data.role, expectedRole);
      assert.equal(body.data.account_status, "ACTIVE");
      assert.equal("auth_provider_user_id" in body.data, false);
    }

    // Ephemeral KOMTING PATCH /api/v1/me
    const profileUser = await createEphemeralKomtingUser({
      tag: "profile",
      fullName: "Before Live Update",
    });
    const newName = `After Live Update ${runId}`;
    profileUser.hadAuditLogs = true;

    const patchRes = await apiFetch("/api/v1/me", {
      method: "PATCH",
      token: profileUser.token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: newName }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = (await patchRes.json()) as { data: { full_name: string } };
    assert.equal(patchBody.data.full_name, newName);

    // Reject mass assignment (role / account_status)
    const massAssignRes = await apiFetch("/api/v1/me", {
      method: "PATCH",
      token: profileUser.token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Hacker", role: "ADMIN", account_status: "INACTIVE" }),
    });
    assert.equal(massAssignRes.status, 400);
    const { data: verifyDbUser } = await admin
      .from("users")
      .select("full_name, role, account_status")
      .eq("id", profileUser.userId)
      .single();
    assert.equal(verifyDbUser?.full_name, newName);
    assert.equal(verifyDbUser?.role, "KOMTING");
    assert.equal(verifyDbUser?.account_status, "ACTIVE");
  });

  it("4. validates live storage uploads (JPEG/PNG/WEBP, >5MB, invalid MIME/magic, signed URL, non-public, DB-failure cleanup)", async () => {
    const storageTester = await createEphemeralKomtingUser({
      tag: "storage",
      fullName: "Live Storage Tester",
    });

    // 4a. > 5 MB file rejected
    const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    oversizedBytes[0] = 0xff;
    oversizedBytes[1] = 0xd8;
    oversizedBytes[2] = 0xff;
    const bigForm = new FormData();
    bigForm.set("full_name", "Live Storage Tester");
    bigForm.set("email", storageTester.email);
    bigForm.set("student_id", `NIM-BIG-${runId}`);
    bigForm.set("class_name", `IF-STOR-${runId}`);
    bigForm.set("identity_photo", new File([oversizedBytes], "big.jpg", { type: "image/jpeg" }));

    const bigRes = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: storageTester.token,
      body: bigForm,
    });
    assert.equal(bigRes.status, 422);

    // 4b. Invalid magic bytes rejected
    const badMagicForm = new FormData();
    badMagicForm.set("full_name", "Live Storage Tester");
    badMagicForm.set("email", storageTester.email);
    badMagicForm.set("student_id", `NIM-BAD-${runId}`);
    badMagicForm.set("class_name", `IF-STOR-${runId}`);
    badMagicForm.set(
      "identity_photo",
      new File([Buffer.from("plain text fake image")], "fake.jpg", { type: "image/jpeg" })
    );
    const badMagicRes = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: storageTester.token,
      body: badMagicForm,
    });
    assert.equal(badMagicRes.status, 422);

    // 4c. Spoofed MIME mismatch rejected (PNG header labeled image/webp)
    const spoofForm = new FormData();
    spoofForm.set("full_name", "Live Storage Tester");
    spoofForm.set("email", storageTester.email);
    spoofForm.set("student_id", `NIM-SPOOF-${runId}`);
    spoofForm.set("class_name", `IF-STOR-${runId}`);
    spoofForm.set(
      "identity_photo",
      new File([await makePngFile().arrayBuffer()], "spoof.webp", { type: "image/webp" })
    );
    const spoofRes = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: storageTester.token,
      body: spoofForm,
    });
    assert.equal(spoofRes.status, 422);

    // 4d. DB insert failure cleans up real uploaded object from PINJAM_TESTING storage bucket
    const rollbackTester = await createEphemeralKomtingUser({
      tag: "rollback",
      fullName: "Live Rollback Tester",
    });
    const rollbackForm = new FormData();
    rollbackForm.set("full_name", "Live Rollback Tester");
    rollbackForm.set("email", rollbackTester.email);
    rollbackForm.set("student_id", `NIM-RB-${runId}`);
    rollbackForm.set("class_name", `IF-RB-${runId}`);
    rollbackForm.set("identity_photo", makeJpegFile("rollback.jpg"));

    await assert.rejects(() =>
      submitKomtingApplication(
        {
          authUserId: rollbackTester.authId,
          user: {
            id: rollbackTester.userId,
            email: rollbackTester.email,
            full_name: "Live Rollback Tester",
            role: "KOMTING",
            account_status: "ACTIVE",
            komting_assignment: null,
          },
          rawUser: {
            id: rollbackTester.userId,
            auth_provider_user_id: rollbackTester.authId,
            email: rollbackTester.email,
            full_name: "Live Rollback Tester",
            role: "KOMTING",
            account_status: "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          komtingAssignment: null,
        },
        rollbackForm,
        `req-rb-${runId}`,
        {
          storage: createSupabaseIdentityStorageAdapter(),
          repository: {
            hasActiveAssignmentForUser: async () => false,
            hasActiveAssignmentForClass: async () => false,
            hasActiveApplicationForUser: async () => false,
            createApplication: async () => {
              throw new AuthError({
                status: 500,
                code: "INTERNAL_ERROR",
                message: "Simulated DB failure after live upload",
              });
            },
            getLatestApplicationForUser: async () => null,
            listApplications: async () => ({ items: [], totalItems: 0 }),
            getApplicationById: async () => null,
            approveApplicationAtomic: async () => {
              throw new Error("unused");
            },
            rejectApplicationAtomic: async () => {
              throw new Error("unused");
            },
            approveReplacementAtomic: async () => {
              throw new Error("unused");
            },
            deactivateAssignmentAtomic: async () => {
              throw new Error("unused");
            },
          },
        }
      )
    );

    const { data: leftoverFiles, error: listErr } = await admin.storage
      .from(config.bucketName)
      .list(`applications/${rollbackTester.userId}`);
    assert.equal(listErr, null);
    assert.equal(
      leftoverFiles?.length ?? 0,
      0,
      "Uploaded storage file must be cleaned up when DB insert fails"
    );

    // 4e. Real PNG & WEBP upload check + private access & signed URL download check
    const pngFile = makePngFile("live-check.png");
    const pngBytes = new Uint8Array(await pngFile.arrayBuffer());
    const pngForm = new FormData();
    pngForm.set("full_name", "Live Storage Tester");
    pngForm.set("email", storageTester.email);
    pngForm.set("student_id", `NIM-PNG-${runId}`);
    pngForm.set("class_name", `IF-STOR-${runId}`);
    pngForm.set("identity_photo", pngFile);
    storageTester.hadAuditLogs = true;

    const pngRes = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: storageTester.token,
      body: pngForm,
    });
    assert.equal(pngRes.status, 201);
    const pngBody = (await pngRes.json()) as { data: { application_id: string } };
    const pngAppId = pngBody.data.application_id;
    createdApplicationIds.push(pngAppId);
    createdOutboxDedupKeys.push(`komting-app-submitted:${pngAppId}`);

    const { data: storedApp } = await admin
      .from("komting_applications")
      .select("identity_photo_storage_key")
      .eq("id", pngAppId)
      .single();
    assert.ok(storedApp?.identity_photo_storage_key);
    createdStorageKeys.push(storedApp.identity_photo_storage_key);

    // Verify public object URL is NOT accessible
    const publicObjRes = await fetch(
      `${config.supabaseUrl}/storage/v1/object/public/${config.bucketName}/${storedApp.identity_photo_storage_key}`
    );
    assert.notEqual(
      publicObjRes.status,
      200,
      "Private bucket object must not be publicly accessible"
    );

    // Verify authenticated raw object URL without authorization is rejected
    const rawAuthObjRes = await fetch(
      `${config.supabaseUrl}/storage/v1/object/${config.bucketName}/${storedApp.identity_photo_storage_key}`
    );
    assert.notEqual(rawAuthObjRes.status, 200, "Unauthenticated object fetch must fail");

    // Verify Admin detail returns signed URL and signed URL downloads exact PNG bytes
    const detailRes = await apiFetch(`/api/v1/admin/komting/applications/${pngAppId}`, {
      method: "GET",
      token: adminToken,
    });
    assert.equal(detailRes.status, 200);
    const detailBody = (await detailRes.json()) as {
      data: { identity_photo_signed_url: string | null; has_identity_photo: boolean };
    };
    assert.equal(detailBody.data.has_identity_photo, true);
    assert.ok(detailBody.data.identity_photo_signed_url);

    const signedFetch = await fetch(detailBody.data.identity_photo_signed_url);
    assert.equal(signedFetch.status, 200, "Signed URL must be downloadable");
    const downloadedBytes = new Uint8Array(await signedFetch.arrayBuffer());
    assert.deepEqual(downloadedBytes, pngBytes);

    // Reject & re-apply with WEBP to verify WEBP live upload works as well
    const rejectRes = await apiFetch(`/api/v1/admin/komting/applications/${pngAppId}/reject`, {
      method: "POST",
      token: adminToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Uji ulang WEBP" }),
    });
    assert.equal(rejectRes.status, 200);
    createdOutboxDedupKeys.push(`komting-app-rejected:${pngAppId}`);

    const webpForm = new FormData();
    webpForm.set("full_name", "Live Storage Tester");
    webpForm.set("email", storageTester.email);
    webpForm.set("student_id", `NIM-WEBP-${runId}`);
    webpForm.set("class_name", `IF-WEBP-${runId}`);
    webpForm.set("identity_photo", makeWebpFile("live-check.webp"));
    const webpRes = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: storageTester.token,
      body: webpForm,
    });
    assert.equal(webpRes.status, 201);
    const webpBody = (await webpRes.json()) as { data: { application_id: string } };
    createdApplicationIds.push(webpBody.data.application_id);
    createdOutboxDedupKeys.push(`komting-app-submitted:${webpBody.data.application_id}`);

    const { data: webpApp } = await admin
      .from("komting_applications")
      .select("identity_photo_storage_key")
      .eq("id", webpBody.data.application_id)
      .single();
    if (webpApp?.identity_photo_storage_key) {
      createdStorageKeys.push(webpApp.identity_photo_storage_key);
    }
  });

  it("5. runs complete live KOMTING workflow: NEW JPEG submit, /applications/me, ADMIN approve, REPLACEMENT submit + approve-replacement, and assignment deactivate", async () => {
    const className = `IF-LIVE-${runId}`;

    const applicant1 = await createEphemeralKomtingUser({
      tag: "app1",
      fullName: "Live Komting Applicant 1",
    });
    applicant1.hadAuditLogs = true;

    const applicant3 = await createEphemeralKomtingUser({
      tag: "app3",
      fullName: "Live Komting Replacement 3",
    });
    applicant3.hadAuditLogs = true;

    // conc-komting2 (no applications yet) -> 404 NOT_FOUND on /komting/applications/me
    const noneRes = await apiFetch("/api/v1/komting/applications/me", {
      method: "GET",
      token: komting2Token,
    });
    assert.equal(noneRes.status, 404);

    // conc-komting1 (already has ACTIVE assignment) -> 409 STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT
    const existingAssignForm = new FormData();
    existingAssignForm.set("full_name", "Conc Komting 1");
    existingAssignForm.set("email", "conc-komting1@example.test");
    existingAssignForm.set("student_id", `NIM-K1-${runId}`);
    existingAssignForm.set("class_name", className);
    existingAssignForm.set("identity_photo", makeJpegFile());
    const alreadyAssignRes = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: komting1Token,
      body: existingAssignForm,
    });
    assert.equal(alreadyAssignRes.status, 409);

    // 1. Applicant 1 submits NEW JPEG application
    const app1Form = new FormData();
    app1Form.set("full_name", "Live Komting Applicant 1");
    app1Form.set("email", applicant1.email);
    app1Form.set("student_id", `NIM-A1-${runId}`);
    app1Form.set("class_name", className);
    app1Form.set("identity_photo", makeJpegFile("app1.jpg"));

    const app1Res = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: applicant1.token,
      body: app1Form,
    });
    assert.equal(app1Res.status, 201);
    const app1Body = (await app1Res.json()) as {
      data: { application_id: string; status: string; submitted_at: string };
    };
    const app1Id = app1Body.data.application_id;
    assert.equal(app1Body.data.status, "PENDING_VERIFICATION");
    createdApplicationIds.push(app1Id);
    createdOutboxDedupKeys.push(`komting-app-submitted:${app1Id}`);

    const { data: app1Db } = await admin
      .from("komting_applications")
      .select("identity_photo_storage_key")
      .eq("id", app1Id)
      .single();
    if (app1Db?.identity_photo_storage_key) {
      createdStorageKeys.push(app1Db.identity_photo_storage_key);
    }

    // Duplicate active submission blocked with 409 APPLICATION_ALREADY_EXISTS
    const dupForm = new FormData();
    dupForm.set("full_name", "Live Komting Applicant 1");
    dupForm.set("email", applicant1.email);
    dupForm.set("student_id", `NIM-A1-${runId}`);
    dupForm.set("class_name", className);
    dupForm.set("identity_photo", makeJpegFile("dup.jpg"));
    const dupRes = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: applicant1.token,
      body: dupForm,
    });
    assert.equal(dupRes.status, 409);

    // 2. Applicant 1 checks GET /api/v1/komting/applications/me
    const myAppRes = await apiFetch("/api/v1/komting/applications/me", {
      method: "GET",
      token: applicant1.token,
    });
    assert.equal(myAppRes.status, 200);
    const myAppBody = (await myAppRes.json()) as {
      data: {
        application_id: string;
        application_type: string;
        status: string;
        class_name: string;
      };
    };
    assert.equal(myAppBody.data.application_id, app1Id);
    assert.equal(myAppBody.data.application_type, "NEW");
    assert.equal(myAppBody.data.status, "PENDING_VERIFICATION");
    assert.equal(myAppBody.data.class_name, className);

    // 3. ADMIN lists pending applications and views detail
    const adminListRes = await apiFetch(
      "/api/v1/admin/komting/applications?status=PENDING_VERIFICATION&page_size=50",
      {
        method: "GET",
        token: adminToken,
      }
    );
    assert.equal(adminListRes.status, 200);
    const adminListBody = (await adminListRes.json()) as {
      data: Array<{ application_id: string }>;
      meta: { pagination: { page: number } };
    };
    assert.ok(adminListBody.data.some((row) => row.application_id === app1Id));

    // 4. ADMIN approves Applicant 1 via POST .../approve
    const approveRes = await apiFetch(`/api/v1/admin/komting/applications/${app1Id}/approve`, {
      method: "POST",
      token: adminToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_note: "Live test approve" }),
    });
    assert.equal(approveRes.status, 200);
    const approveBody = (await approveRes.json()) as {
      data: {
        application_id: string;
        status: string;
        assignment: { id: string; status: string; class_name: string };
      };
    };
    assert.equal(approveBody.data.application_id, app1Id);
    assert.equal(approveBody.data.status, "APPROVED");
    assert.equal(approveBody.data.assignment.status, "ACTIVE");
    assert.equal(approveBody.data.assignment.class_name, className);
    const assign1Id = approveBody.data.assignment.id;
    createdAssignmentIds.push(assign1Id);
    createdOutboxDedupKeys.push(`komting-app-approved:${app1Id}`);

    // Applicant 1 now passes requireActiveKomting
    const activeCtx = await requireActiveKomting(
      new Request(`${baseUrl}/api/v1/bookings`, {
        headers: { Authorization: `Bearer ${applicant1.token}` },
      })
    );
    assert.equal(activeCtx.komtingAssignment.id, assign1Id);

    // Re-approving already APPROVED application returns 409 APPLICATION_STATUS_INVALID
    const reApproveRes = await apiFetch(`/api/v1/admin/komting/applications/${app1Id}/approve`, {
      method: "POST",
      token: adminToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(reApproveRes.status, 409);

    // 5. Applicant 3 submits application for SAME active class -> REPLACEMENT
    const app3Form = new FormData();
    app3Form.set("full_name", "Live Komting Replacement 3");
    app3Form.set("email", applicant3.email);
    app3Form.set("student_id", `NIM-A3-${runId}`);
    app3Form.set("class_name", className);
    app3Form.set("identity_photo", makeJpegFile("app3.jpg"));

    const app3Res = await apiFetch("/api/v1/komting/applications", {
      method: "POST",
      token: applicant3.token,
      body: app3Form,
    });
    assert.equal(app3Res.status, 201);
    const app3Body = (await app3Res.json()) as { data: { application_id: string } };
    const app3Id = app3Body.data.application_id;
    createdApplicationIds.push(app3Id);
    createdOutboxDedupKeys.push(`komting-app-submitted:${app3Id}`);

    const { data: app3Db } = await admin
      .from("komting_applications")
      .select("application_type, identity_photo_storage_key")
      .eq("id", app3Id)
      .single();
    assert.equal(app3Db?.application_type, "REPLACEMENT");
    if (app3Db?.identity_photo_storage_key) {
      createdStorageKeys.push(app3Db.identity_photo_storage_key);
    }

    // Standard approve on REPLACEMENT fails with 409 CLASS_ALREADY_HAS_ACTIVE_KOMTING
    const wrongApproveRes = await apiFetch(`/api/v1/admin/komting/applications/${app3Id}/approve`, {
      method: "POST",
      token: adminToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(wrongApproveRes.status, 409);

    // 6. ADMIN approves replacement atomically via POST .../approve-replacement
    const replaceRes = await apiFetch(
      `/api/v1/admin/komting/applications/${app3Id}/approve-replacement`,
      {
        method: "POST",
        token: adminToken,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_note: "Live test replacement" }),
      }
    );
    assert.equal(replaceRes.status, 200);
    const replaceBody = (await replaceRes.json()) as {
      data: {
        application_id: string;
        status: string;
        assignment: { id: string; status: string; class_name: string };
      };
    };
    assert.equal(replaceBody.data.status, "APPROVED");
    assert.equal(replaceBody.data.assignment.status, "ACTIVE");
    const assign3Id = replaceBody.data.assignment.id;
    createdAssignmentIds.push(assign3Id);
    createdOutboxDedupKeys.push(
      `komting-replaced-old:${app3Id}:${assign1Id}`,
      `komting-replacement-new:${app3Id}`
    );

    const { data: oldAssignDb } = await admin
      .from("komting_assignments")
      .select("status")
      .eq("id", assign1Id)
      .single();
    assert.equal(oldAssignDb?.status, "REPLACED");

    // 7. ADMIN deactivates Applicant 3's assignment via POST .../deactivate
    const blankDeactRes = await apiFetch(
      `/api/v1/admin/komting/assignments/${assign3Id}/deactivate`,
      {
        method: "POST",
        token: adminToken,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "   " }),
      }
    );
    assert.equal(blankDeactRes.status, 422);

    const deactRes = await apiFetch(`/api/v1/admin/komting/assignments/${assign3Id}/deactivate`, {
      method: "POST",
      token: adminToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Uji penonaktifan selesai" }),
    });
    assert.equal(deactRes.status, 200);
    const deactBody = (await deactRes.json()) as { data: { success: boolean } };
    assert.equal(deactBody.data.success, true);
    createdOutboxDedupKeys.push(`komting-assign-deactivated:${assign3Id}`);

    const { data: deactivatedDb } = await admin
      .from("komting_assignments")
      .select("status, end_reason")
      .eq("id", assign3Id)
      .single();
    assert.equal(deactivatedDb?.status, "INACTIVE");

    // Deactivating again -> 409 ASSIGNMENT_NOT_ACTIVE
    const deactAgainRes = await apiFetch(
      `/api/v1/admin/komting/assignments/${assign3Id}/deactivate`,
      {
        method: "POST",
        token: adminToken,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Double deactivate" }),
      }
    );
    assert.equal(deactAgainRes.status, 409);
  });
});

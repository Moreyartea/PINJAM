import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError, toSafeAuthErrorResponse } from "@/lib/auth/errors";
import { POST as loginPostRoute } from "@/app/api/v1/auth/login/route";
import { POST as logoutPostRoute } from "@/app/api/v1/auth/logout/route";
import {
  requireActiveKomting,
  requireAdmin,
  requireAuthenticatedUser,
  requireRole,
  requireStaffOrAdmin,
} from "@/lib/auth/guards";
import {
  extractBearerToken,
  getServerSessionContext,
  signInWithEmailPassword,
  signOutCurrentSession,
  type AuthClientLike,
  type SessionDependencies,
} from "@/lib/auth/session";
import { syncAuthUserWithProfile } from "@/lib/auth/sync-user";
import type { AuthUserRepository, SupabaseAuthIdentity } from "@/lib/auth/types";
import type { KomtingAssignmentRow, PublicUserRow } from "@/lib/supabase/database.types";

function makeUserRow(overrides: Partial<PublicUserRow> = {}): PublicUserRow {
  return {
    id: "user-uuid-1",
    auth_provider_user_id: "auth-uuid-1",
    email: "komting@example.test",
    full_name: "Komting Aktif",
    role: "KOMTING",
    account_status: "ACTIVE",
    created_at: "2026-11-26T00:00:00Z",
    updated_at: "2026-11-26T00:00:00Z",
    ...overrides,
  };
}

function makeAssignmentRow(overrides: Partial<KomtingAssignmentRow> = {}): KomtingAssignmentRow {
  return {
    id: "assign-uuid-1",
    user_id: "user-uuid-1",
    class_name: "IF-01",
    status: "ACTIVE",
    started_at: "2026-11-26T00:00:00Z",
    ended_at: null,
    created_by: "admin-uuid-1",
    ended_by: null,
    end_reason: null,
    created_at: "2026-11-26T00:00:00Z",
    updated_at: "2026-11-26T00:00:00Z",
    ...overrides,
  };
}

function makeRepo(
  users: PublicUserRow[],
  assignments: KomtingAssignmentRow[] = []
): AuthUserRepository {
  return {
    async findByAuthProviderUserId(authProviderUserId: string) {
      return users.find((u) => u.auth_provider_user_id === authProviderUserId) ?? null;
    },
    async linkUnlinkedUserByEmail(normalizedEmail: string, authProviderUserId: string) {
      const target = users.find(
        (u) => u.auth_provider_user_id === null && u.email.trim().toLowerCase() === normalizedEmail
      );
      if (!target) return null;
      target.auth_provider_user_id = authProviderUserId;
      return target;
    },
    async updateEmail(userId: string, normalizedEmail: string) {
      const target = users.find((u) => u.id === userId);
      if (!target) return null;
      target.email = normalizedEmail;
      return target;
    },
    async findActiveKomtingAssignment(userId: string) {
      return assignments.find((a) => a.user_id === userId && a.status === "ACTIVE") ?? null;
    },
  };
}

function makeAuthClient(options: {
  user?: SupabaseAuthIdentity | null;
  getUserError?: string | null;
  signInUser?: SupabaseAuthIdentity | null;
  signInExpiresAt?: number | null;
  signInError?: string | null;
  signOutError?: string | null;
  onSignOut?: () => void;
}): AuthClientLike {
  return {
    auth: {
      async getUser() {
        if (options.getUserError) {
          return { data: { user: null }, error: { message: options.getUserError } };
        }
        return { data: { user: options.user ?? null }, error: null };
      },
      async signInWithPassword() {
        if (options.signInError) {
          return {
            data: { user: null, session: null },
            error: { message: options.signInError },
          };
        }
        return {
          data: {
            user: options.signInUser ?? null,
            session: options.signInUser
              ? { expires_at: options.signInExpiresAt ?? 1893456000 }
              : null,
          },
          error: null,
        };
      },
      async signOut() {
        options.onSignOut?.();
        if (options.signOutError) {
          return { error: { message: options.signOutError } };
        }
        return { error: null };
      },
    },
  };
}

describe("public.users synchronization", () => {
  it("links pre-created unlinked public.users row when email is confirmed", async () => {
    const preCreated = makeUserRow({
      id: "staff-1",
      auth_provider_user_id: null,
      email: "staff@example.test",
      role: "STAFF",
    });
    const repo = makeRepo([preCreated]);

    const result = await syncAuthUserWithProfile(
      {
        id: "auth-staff-1",
        email: "STAFF@example.test",
        email_confirmed_at: "2026-11-26T10:00:00Z",
      },
      repo
    );

    assert.equal(result.status, "SYNCED");
    assert.equal(result.profile?.auth_provider_user_id, "auth-staff-1");
    assert.equal(result.profile?.role, "STAFF");
  });

  it("does NOT link unconfirmed email and never auto-creates missing public.users", async () => {
    const repo = makeRepo([
      makeUserRow({
        auth_provider_user_id: null,
        email: "pending@example.test",
      }),
    ]);

    const unconfirmed = await syncAuthUserWithProfile(
      { id: "auth-pending", email: "pending@example.test", email_confirmed_at: null },
      repo
    );
    assert.equal(unconfirmed.status, "NOT_FOUND");

    const missing = await syncAuthUserWithProfile(
      {
        id: "auth-stranger",
        email: "stranger@example.test",
        email_confirmed_at: "2026-11-26T10:00:00Z",
      },
      repo
    );
    assert.equal(missing.status, "NOT_FOUND");
  });
});

describe("Login and logout", () => {
  it("authenticates ACTIVE user and maps profile + assignment", async () => {
    const userRow = makeUserRow();
    const assignment = makeAssignmentRow();
    const deps: SessionDependencies = {
      createServerClient: async () =>
        makeAuthClient({
          signInUser: {
            id: "auth-uuid-1",
            email: "komting@example.test",
            email_confirmed_at: "2026-11-26T00:00:00Z",
          },
        }),
      userRepository: makeRepo([userRow], [assignment]),
    };

    const result = await signInWithEmailPassword(
      { email: "Komting@example.test", password: "secret" },
      deps
    );
    assert.equal(result.user.id, "user-uuid-1");
    assert.equal(result.user.role, "KOMTING");
    assert.equal(result.user.komting_assignment?.class_name, "IF-01");
    assert.ok(result.session.expires_at);
  });

  it("rejects empty credentials with 400 and invalid credentials with 401", async () => {
    await assert.rejects(
      () => signInWithEmailPassword({ email: "", password: "" }),
      (err: unknown) =>
        err instanceof AuthError && err.status === 400 && err.code === "INVALID_REQUEST"
    );

    const deps: SessionDependencies = {
      createServerClient: async () => makeAuthClient({ signInError: "Invalid login credentials" }),
      userRepository: makeRepo([]),
    };

    await assert.rejects(
      () => signInWithEmailPassword({ email: "a@b.test", password: "wrong" }, deps),
      (err: unknown) =>
        err instanceof AuthError && err.status === 401 && err.code === "AUTH_REQUIRED"
    );
  });

  it("signs out and rejects login if user is missing in public.users or INACTIVE", async () => {
    let signedOutCount = 0;

    const missingDeps: SessionDependencies = {
      createServerClient: async () =>
        makeAuthClient({
          signInUser: {
            id: "auth-missing",
            email: "missing@example.test",
            email_confirmed_at: "2026-11-26T00:00:00Z",
          },
          onSignOut: () => {
            signedOutCount += 1;
          },
        }),
      userRepository: makeRepo([]),
    };

    await assert.rejects(
      () =>
        signInWithEmailPassword({ email: "missing@example.test", password: "secret" }, missingDeps),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(signedOutCount, 1);

    const inactiveRow = makeUserRow({ account_status: "INACTIVE" });
    const inactiveDeps: SessionDependencies = {
      createServerClient: async () =>
        makeAuthClient({
          signInUser: {
            id: "auth-uuid-1",
            email: "komting@example.test",
            email_confirmed_at: "2026-11-26T00:00:00Z",
          },
          onSignOut: () => {
            signedOutCount += 1;
          },
        }),
      userRepository: makeRepo([inactiveRow]),
    };

    await assert.rejects(
      () =>
        signInWithEmailPassword(
          { email: "komting@example.test", password: "secret" },
          inactiveDeps
        ),
      (err: unknown) =>
        err instanceof AuthError && err.status === 403 && err.code === "ACCOUNT_NOT_ACTIVE"
    );
    assert.equal(signedOutCount, 2);
  });

  it("signs out active session cleanly (SSR + Bearer) and surfaces errors safely", async () => {
    let signedOut = false;
    let revokedBearer = "";
    await signOutCurrentSession({
      createServerClient: async () =>
        makeAuthClient({
          onSignOut: () => {
            signedOut = true;
          },
        }),
    });
    assert.equal(signedOut, true);

    await signOutCurrentSession(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer live.jwt.token" },
      }),
      {
        revokeBearerToken: async (token) => {
          revokedBearer = token;
        },
      }
    );
    assert.equal(revokedBearer, "live.jwt.token");

    await assert.rejects(
      () =>
        signOutCurrentSession(
          new Request("http://localhost:3000/api/v1/auth/logout", {
            method: "POST",
            headers: { Authorization: "Basic bad" },
          })
        ),
      (err: unknown) =>
        err instanceof AuthError && err.status === 401 && err.code === "AUTH_REQUIRED"
    );

    await assert.rejects(
      () =>
        signOutCurrentSession({
          createServerClient: async () => makeAuthClient({ signOutError: "internal" }),
        }),
      (err: unknown) => err instanceof AuthError && err.status === 500
    );
  });
});

describe("Session extraction, invalid sessions & authorization guards", () => {
  it("parses Bearer tokens strictly and rejects malformed Authorization headers", async () => {
    assert.equal(extractBearerToken(null), null);
    assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
    assert.equal(extractBearerToken("Basic xyz"), "");
    assert.equal(extractBearerToken("Bearer "), "");

    let cookieClientCalled = false;
    const req = new Request("http://localhost:3000/api/v1/auth/session", {
      headers: { Authorization: "Basic not-a-bearer" },
    });

    const result = await getServerSessionContext(req, {
      createServerClient: async () => {
        cookieClientCalled = true;
        return makeAuthClient({ user: { id: "should-not-use-cookie" } });
      },
      userRepository: makeRepo([]),
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.reason, "INVALID_SESSION");
    assert.equal(cookieClientCalled, false);
  });

  it("rejects invalid/expired Bearer token with 401 AUTH_REQUIRED", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/session", {
      headers: { Authorization: "Bearer expired.jwt" },
    });

    await assert.rejects(
      () =>
        requireAuthenticatedUser(req, undefined, {
          createBearerClient: () => makeAuthClient({ getUserError: "JWT expired" }),
          userRepository: makeRepo([]),
        }),
      (err: unknown) =>
        err instanceof AuthError && err.status === 401 && err.code === "AUTH_REQUIRED"
    );
  });

  it("rejects authenticated user missing from public.users with 403 FORBIDDEN", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/session", {
      headers: { Authorization: "Bearer valid.jwt" },
    });

    await assert.rejects(
      () =>
        requireAuthenticatedUser(req, undefined, {
          createBearerClient: () =>
            makeAuthClient({
              user: {
                id: "auth-unknown",
                email: "unknown@example.test",
                email_confirmed_at: "2026-11-26T00:00:00Z",
              },
            }),
          userRepository: makeRepo([]),
        }),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );
  });

  it("blocks INACTIVE, REJECTED, and PENDING_VERIFICATION users from app access", async () => {
    for (const status of ["INACTIVE", "REJECTED", "PENDING_VERIFICATION"] as const) {
      const row = makeUserRow({ account_status: status });
      const req = new Request("http://localhost:3000/api/v1/auth/session", {
        headers: { Authorization: "Bearer valid.jwt" },
      });

      await assert.rejects(
        () =>
          requireAuthenticatedUser(req, undefined, {
            createBearerClient: () =>
              makeAuthClient({
                user: { id: "auth-uuid-1", email: row.email },
              }),
            userRepository: makeRepo([row]),
          }),
        (err: unknown) =>
          err instanceof AuthError && err.status === 403 && err.code === "ACCOUNT_NOT_ACTIVE"
      );
    }
  });

  it("enforces KOMTING active assignment, STAFF, and ADMIN roles strictly from public.users", async () => {
    const komtingNoAssign = makeUserRow({ role: "KOMTING" });
    const req = new Request("http://localhost:3000/api/v1/bookings", {
      headers: { Authorization: "Bearer valid.jwt" },
    });

    const komtingDepsNoAssign: SessionDependencies = {
      createBearerClient: () =>
        makeAuthClient({ user: { id: "auth-uuid-1", email: komtingNoAssign.email } }),
      userRepository: makeRepo([komtingNoAssign], []),
    };

    await assert.rejects(
      () => requireActiveKomting(req, komtingDepsNoAssign),
      (err: unknown) =>
        err instanceof AuthError && err.status === 403 && err.code === "KOMTING_ASSIGNMENT_REQUIRED"
    );

    const komtingDepsWithAssign: SessionDependencies = {
      createBearerClient: () =>
        makeAuthClient({ user: { id: "auth-uuid-1", email: komtingNoAssign.email } }),
      userRepository: makeRepo([komtingNoAssign], [makeAssignmentRow()]),
    };

    const activeKomting = await requireActiveKomting(req, komtingDepsWithAssign);
    assert.equal(activeKomting.user.role, "KOMTING");
    assert.equal(activeKomting.komtingAssignment.class_name, "IF-01");

    // STAFF passes requireStaffOrAdmin, fails requireAdmin
    const staffRow = makeUserRow({
      id: "staff-id",
      auth_provider_user_id: "auth-staff",
      role: "STAFF",
    });
    const staffDeps: SessionDependencies = {
      createBearerClient: () =>
        makeAuthClient({ user: { id: "auth-staff", email: staffRow.email } }),
      userRepository: makeRepo([staffRow]),
    };

    const staffCtx = await requireStaffOrAdmin(req, staffDeps);
    assert.equal(staffCtx.user.role, "STAFF");

    await assert.rejects(
      () => requireAdmin(req, staffDeps),
      (err: unknown) => err instanceof AuthError && err.status === 403 && err.code === "FORBIDDEN"
    );

    // ADMIN passes requireAdmin & requireRole(["ADMIN"])
    const adminRow = makeUserRow({
      id: "admin-id",
      auth_provider_user_id: "auth-admin",
      role: "ADMIN",
    });
    const adminDeps: SessionDependencies = {
      createBearerClient: () =>
        makeAuthClient({ user: { id: "auth-admin", email: adminRow.email } }),
      userRepository: makeRepo([adminRow]),
    };

    const adminCtx = await requireAdmin(req, adminDeps);
    assert.equal(adminCtx.user.role, "ADMIN");
    const roleCtx = await requireRole(["ADMIN"], req, adminDeps);
    assert.equal(roleCtx.user.id, "admin-id");
  });

  it("supports SSR cookie session lookup in Server Components", async () => {
    const staffRow = makeUserRow({
      id: "staff-ssr",
      auth_provider_user_id: "auth-staff-ssr",
      role: "STAFF",
    });

    const ctx = await requireAuthenticatedUser(undefined, undefined, {
      createServerClient: async () =>
        makeAuthClient({ user: { id: "auth-staff-ssr", email: staffRow.email } }),
      userRepository: makeRepo([staffRow]),
    });

    assert.equal(ctx.user.id, "staff-ssr");
    assert.equal(ctx.user.role, "STAFF");
  });

  it("maps auth errors and invalid login route payloads to safe API Contract envelopes", async () => {
    const badJsonReq = new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });

    const badJsonRes = await loginPostRoute(badJsonReq);
    assert.equal(badJsonRes.status, 400);
    const badJsonBody = (await badJsonRes.json()) as {
      error: { code: string };
      meta: { request_id: string };
    };
    assert.equal(badJsonBody.error.code, "INVALID_REQUEST");
    assert.match(badJsonBody.meta.request_id, /^req_/);

    const internalRes = toSafeAuthErrorResponse(new Error("sensitive db stack"), "req_test_1");
    assert.equal(internalRes.status, 500);
    const internalBody = (await internalRes.json()) as {
      error: { code: string; message: string };
      meta: { request_id: string };
    };
    assert.equal(internalBody.error.code, "INTERNAL_ERROR");
    assert.doesNotMatch(internalBody.error.message, /sensitive db stack/);
    assert.equal(internalBody.meta.request_id, "req_test_1");

    const badLogoutRes = await logoutPostRoute(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: "Basic malformed" },
      })
    );
    assert.equal(badLogoutRes.status, 401);
    const badLogoutBody = (await badLogoutRes.json()) as {
      error: { code: string };
    };
    assert.equal(badLogoutBody.error.code, "AUTH_REQUIRED");
  });
});

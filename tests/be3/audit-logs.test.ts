import assert from "node:assert/strict";
import { describe, it } from "node:test";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder-test.supabase.co";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-role-key";
}

import { GET as adminAuditLogsRoute } from "@/app/api/v1/admin/audit-logs/route";
import { GET as adminAuditLogDetailRoute } from "@/app/api/v1/admin/audit-logs/[id]/route";
import { AuthError } from "@/lib/auth/errors";
import type { AuthClientLike, SessionDependencies } from "@/lib/auth/session";
import type {
  AuthenticatedUserContext,
  AuthUserRepository,
  SupabaseAuthIdentity,
} from "@/lib/auth/types";
import type { PublicUserRow } from "@/lib/supabase/database.types";
import {
  getAdminAuditLogDetail,
  listAdminAuditLogs,
  type AuditRepository,
} from "@/lib/audit/audit-service";
import type { AuditLogEntry } from "@/types/domain";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const KOMTING_ID = "33333333-3333-4333-8333-333333333333";

const LOG_1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOG_2_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOG_3_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeContext(role: "ADMIN" | "STAFF" | "KOMTING"): AuthenticatedUserContext {
  const id = role === "ADMIN" ? ADMIN_ID : role === "STAFF" ? STAFF_ID : KOMTING_ID;
  const email = `${role.toLowerCase()}@example.test`;
  const nowIso = "2026-11-26T00:00:00.000Z";
  return {
    authUserId: `auth-${id}`,
    user: {
      id,
      email,
      full_name: `Test ${role}`,
      role,
      account_status: "ACTIVE",
      komting_assignment: null,
    },
    rawUser: {
      id,
      auth_provider_user_id: `auth-${id}`,
      email,
      full_name: `Test ${role}`,
      role,
      account_status: "ACTIVE",
      created_at: nowIso,
      updated_at: nowIso,
    },
    komtingAssignment: null,
  };
}

function makeUserRow(role: "ADMIN" | "STAFF" | "KOMTING"): PublicUserRow {
  const id = role === "ADMIN" ? ADMIN_ID : role === "STAFF" ? STAFF_ID : KOMTING_ID;
  return {
    id,
    auth_provider_user_id: `auth-${id}`,
    email: `${role.toLowerCase()}@example.test`,
    full_name: `Test ${role}`,
    role,
    account_status: "ACTIVE",
    created_at: "2026-11-26T00:00:00.000Z",
    updated_at: "2026-11-26T00:00:00.000Z",
  };
}

function makeAuthClient(user?: SupabaseAuthIdentity | null): AuthClientLike {
  return {
    auth: {
      async getUser() {
        return { data: { user: user ?? null }, error: null };
      },
      async signInWithPassword() {
        return { data: { user: null, session: null }, error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
  };
}

function makeUserRepo(users: PublicUserRow[]): AuthUserRepository {
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
    async findActiveKomtingAssignment() {
      return null;
    },
  };
}

function makeSessionDepsForRole(role: "ADMIN" | "STAFF" | "KOMTING"): SessionDependencies {
  const user = makeUserRow(role);
  const authIdentity: SupabaseAuthIdentity = {
    id: user.auth_provider_user_id!,
    email: user.email,
  };

  const client = makeAuthClient(authIdentity);

  return {
    createBearerClient: () => client,
    createServerClient: async () => client,
    userRepository: makeUserRepo([user]),
  };
}

function makeSampleAuditLogs(): AuditLogEntry[] {
  return [
    {
      id: LOG_1_ID,
      actor_user_id: ADMIN_ID,
      actor_role: "ADMIN",
      action: "PROJECTOR_CREATE",
      entity_type: "PROJECTOR",
      entity_id: "prj-101",
      before_data: null,
      after_data: { asset_code: "PRJ-101", name: "Epson EB-X500" },
      reason: "Penambahan proyektor baru",
      request_id: "req-001",
      created_at: "2026-11-26T10:00:00.000Z",
    },
    {
      id: LOG_2_ID,
      actor_user_id: STAFF_ID,
      actor_role: "STAFF",
      action: "BOOKING_CONFIRM",
      entity_type: "BOOKING",
      entity_id: "bkg-202",
      before_data: { status: "PENDING" },
      after_data: { status: "CONFIRMED" },
      reason: "Konfirmasi peminjaman",
      request_id: "req-002",
      created_at: "2026-11-26T11:00:00.000Z",
    },
    {
      id: LOG_3_ID,
      actor_user_id: ADMIN_ID,
      actor_role: "ADMIN",
      action: "OPERATING_HOURS_UPDATE",
      entity_type: "OPERATING_HOURS",
      entity_id: "oh-303",
      before_data: { opens_at: "08:00", closes_at: "17:00" },
      after_data: { opens_at: "07:30", closes_at: "17:00" },
      reason: "Buka lebih awal untuk ujian",
      request_id: "req-003",
      created_at: "2026-11-26T12:00:00.000Z",
    },
  ];
}

function makeMockAuditRepository(initialLogs = makeSampleAuditLogs()): AuditRepository {
  const logs = [...initialLogs];

  return {
    async listAuditLogs({ entityType, entityId, page, pageSize, sortBy, sortOrder }) {
      const filtered = logs.filter((item) => {
        if (entityType && entityType !== "ALL" && item.entity_type !== entityType) {
          return false;
        }
        if (entityId && item.entity_id !== entityId) {
          return false;
        }
        return true;
      });

      filtered.sort((a, b) => {
        const valA = String(a[sortBy as keyof AuditLogEntry] ?? "");
        const valB = String(b[sortBy as keyof AuditLogEntry] ?? "");
        return sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      });

      const totalItems = filtered.length;
      const offset = (page - 1) * pageSize;
      const items = filtered.slice(offset, offset + pageSize);

      return { items, totalItems };
    },

    async getAuditLogById(id: string) {
      return logs.find((l) => l.id === id) ?? null;
    },
  };
}

describe("Audit Log Service: listAdminAuditLogs", () => {
  it("allows ADMIN to list audit logs with pagination and filters", async () => {
    const admin = makeContext("ADMIN");
    const repo = makeMockAuditRepository();

    const result = await listAdminAuditLogs(
      admin,
      "http://localhost:3000/api/v1/admin/audit-logs?page=1&page_size=2",
      { repository: repo }
    );

    assert.equal(result.items.length, 2);
    assert.equal(result.pagination.page, 1);
    assert.equal(result.pagination.page_size, 2);
    assert.equal(result.pagination.total_items, 3);
    assert.equal(result.pagination.total_pages, 2);
  });

  it("filters audit logs by entity_type", async () => {
    const admin = makeContext("ADMIN");
    const repo = makeMockAuditRepository();

    const result = await listAdminAuditLogs(
      admin,
      "http://localhost:3000/api/v1/admin/audit-logs?entity_type=BOOKING",
      { repository: repo }
    );

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.entity_type, "BOOKING");
    assert.equal(result.items[0]?.id, LOG_2_ID);
  });

  it("filters audit logs by entity_id", async () => {
    const admin = makeContext("ADMIN");
    const repo = makeMockAuditRepository();

    const result = await listAdminAuditLogs(
      admin,
      "http://localhost:3000/api/v1/admin/audit-logs?entity_id=prj-101",
      { repository: repo }
    );

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.entity_id, "prj-101");
  });

  it("rejects non-admin roles (STAFF, KOMTING) with 403 FORBIDDEN", async () => {
    const staff = makeContext("STAFF");
    const komting = makeContext("KOMTING");
    const repo = makeMockAuditRepository();

    await assert.rejects(
      () => listAdminAuditLogs(staff, "http://localhost:3000/api/v1/admin/audit-logs", { repository: repo }),
      (err: unknown) =>
        err instanceof AuthError &&
        err.status === 403 &&
        err.code === "FORBIDDEN" &&
        err.message.includes("Hanya admin")
    );

    await assert.rejects(
      () => listAdminAuditLogs(komting, "http://localhost:3000/api/v1/admin/audit-logs", { repository: repo }),
      (err: unknown) =>
        err instanceof AuthError &&
        err.status === 403 &&
        err.code === "FORBIDDEN" &&
        err.message.includes("Hanya admin")
    );
  });
});

describe("Audit Log Service: getAdminAuditLogDetail", () => {
  it("allows ADMIN to get single audit log by valid UUID", async () => {
    const admin = makeContext("ADMIN");
    const repo = makeMockAuditRepository();

    const detail = await getAdminAuditLogDetail(admin, LOG_1_ID, { repository: repo });
    assert.equal(detail.id, LOG_1_ID);
    assert.equal(detail.action, "PROJECTOR_CREATE");
    assert.equal(detail.entity_type, "PROJECTOR");
  });

  it("returns 404 NOT_FOUND when audit log does not exist", async () => {
    const admin = makeContext("ADMIN");
    const repo = makeMockAuditRepository();
    const missingId = "99999999-9999-4999-8999-999999999999";

    await assert.rejects(
      () => getAdminAuditLogDetail(admin, missingId, { repository: repo }),
      (err: unknown) =>
        err instanceof AuthError &&
        err.status === 404 &&
        err.code === "NOT_FOUND" &&
        err.message.includes("Catatan audit tidak ditemukan")
    );
  });

  it("returns 400 INVALID_REQUEST when ID is not a valid UUID", async () => {
    const admin = makeContext("ADMIN");
    const repo = makeMockAuditRepository();

    await assert.rejects(
      () => getAdminAuditLogDetail(admin, "not-a-valid-uuid", { repository: repo }),
      (err: unknown) =>
        err instanceof AuthError &&
        err.status === 400 &&
        err.code === "INVALID_REQUEST"
    );
  });

  it("rejects non-admin roles (STAFF, KOMTING) with 403 FORBIDDEN", async () => {
    const staff = makeContext("STAFF");
    const repo = makeMockAuditRepository();

    await assert.rejects(
      () => getAdminAuditLogDetail(staff, LOG_1_ID, { repository: repo }),
      (err: unknown) =>
        err instanceof AuthError &&
        err.status === 403 &&
        err.code === "FORBIDDEN" &&
        err.message.includes("Hanya admin")
    );
  });
});

describe("Audit Log Routes: HTTP Endpoints", () => {
  it("rejects unauthenticated requests on both endpoints with 401 AUTH_REQUIRED", async () => {
    const reqList = new Request("http://localhost:3000/api/v1/admin/audit-logs", {
      headers: { Authorization: "Basic invalid" },
    });
    const resList = await adminAuditLogsRoute(reqList);
    assert.equal(resList.status, 401);
    const bodyList = (await resList.json()) as { error: { code: string } };
    assert.equal(bodyList.error.code, "AUTH_REQUIRED");

    const reqDetail = new Request(`http://localhost:3000/api/v1/admin/audit-logs/${LOG_1_ID}`, {
      headers: { Authorization: "Basic invalid" },
    });
    const resDetail = await adminAuditLogDetailRoute(reqDetail, {
      params: Promise.resolve({ id: LOG_1_ID }),
    });
    assert.equal(resDetail.status, 401);
    const bodyDetail = (await resDetail.json()) as { error: { code: string } };
    assert.equal(bodyDetail.error.code, "AUTH_REQUIRED");
  });

  it("rejects STAFF requests with 403 FORBIDDEN", async () => {
    const staffSession = makeSessionDepsForRole("STAFF");
    const repo = makeMockAuditRepository();

    const reqList = new Request("http://localhost:3000/api/v1/admin/audit-logs", {
      headers: { Authorization: "Bearer staff-token" },
    });
    const resList = await adminAuditLogsRoute(reqList, {
      sessionDeps: staffSession,
      serviceDeps: { repository: repo },
    });
    assert.equal(resList.status, 403);

    const reqDetail = new Request(`http://localhost:3000/api/v1/admin/audit-logs/${LOG_1_ID}`, {
      headers: { Authorization: "Bearer staff-token" },
    });
    const resDetail = await adminAuditLogDetailRoute(reqDetail, {
      params: Promise.resolve({ id: LOG_1_ID }),
      routeDeps: {
        sessionDeps: staffSession,
        serviceDeps: { repository: repo },
      },
    });
    assert.equal(resDetail.status, 403);
  });

  it("allows ADMIN to fetch audit logs list and detail with 200 OK", async () => {
    const adminSession = makeSessionDepsForRole("ADMIN");
    const repo = makeMockAuditRepository();

    const reqList = new Request("http://localhost:3000/api/v1/admin/audit-logs?page=1&page_size=10", {
      headers: { Authorization: "Bearer admin-token" },
    });
    const resList = await adminAuditLogsRoute(reqList, {
      sessionDeps: adminSession,
      serviceDeps: { repository: repo },
    });
    assert.equal(resList.status, 200);
    const bodyList = (await resList.json()) as {
      data: AuditLogEntry[];
      meta: { pagination: { total_items: number } };
    };
    assert.equal(bodyList.data.length, 3);
    assert.equal(bodyList.meta.pagination.total_items, 3);

    const reqDetail = new Request(`http://localhost:3000/api/v1/admin/audit-logs/${LOG_1_ID}`, {
      headers: { Authorization: "Bearer admin-token" },
    });
    const resDetail = await adminAuditLogDetailRoute(reqDetail, {
      params: Promise.resolve({ id: LOG_1_ID }),
      routeDeps: {
        sessionDeps: adminSession,
        serviceDeps: { repository: repo },
      },
    });
    assert.equal(resDetail.status, 200);
    const bodyDetail = (await resDetail.json()) as { data: AuditLogEntry };
    assert.equal(bodyDetail.data.id, LOG_1_ID);
    assert.equal(bodyDetail.data.action, "PROJECTOR_CREATE");
  });
});

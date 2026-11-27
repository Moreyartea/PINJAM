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

import { GET as listMaintenanceRoute } from "@/app/api/v1/staff/maintenance/route";
import { POST as startMaintenanceRoute } from "@/app/api/v1/staff/projectors/[projectorId]/maintenance/route";
import { POST as completeMaintenanceRoute } from "@/app/api/v1/staff/maintenance/[maintenanceId]/complete/route";
import type { AuthClientLike, SessionDependencies } from "@/lib/auth/session";
import type { AuthUserRepository, SupabaseAuthIdentity } from "@/lib/auth/types";
import type {
  MaintenanceRecordRow,
  MaintenanceRepository,
} from "@/lib/maintenance/maintenance-service";
import type { PublicUserRow } from "@/lib/supabase/database.types";
import type { MaintenanceRecord, MaintenanceStatus } from "@/types/domain";

const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const KOMTING_ID = "33333333-3333-4333-8333-333333333333";
const PROJECTOR_ID = "44444444-4444-4444-8444-444444444444";
const MAINT_ID = "55555555-5555-4555-8555-555555555555";

function makeUserRow(overrides: Partial<PublicUserRow> = {}): PublicUserRow {
  return {
    id: STAFF_ID,
    auth_provider_user_id: `auth-${STAFF_ID}`,
    email: "staff@example.test",
    full_name: "Staff Operasional",
    role: "STAFF",
    account_status: "ACTIVE",
    created_at: "2026-11-26T00:00:00Z",
    updated_at: "2026-11-26T00:00:00Z",
    ...overrides,
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

function makeSessionDeps(user: PublicUserRow | null): SessionDependencies {
  if (!user) {
    return {
      createServerClient: async () => makeAuthClient(null),
      createBearerClient: () => makeAuthClient(null),
      userRepository: makeUserRepo([]),
    };
  }

  const authIdentity: SupabaseAuthIdentity = {
    id: user.auth_provider_user_id!,
    email: user.email,
  };

  return {
    createServerClient: async () => makeAuthClient(authIdentity),
    createBearerClient: () => makeAuthClient(authIdentity),
    userRepository: makeUserRepo([user]),
  };
}

function createMockMaintenanceRepo(records: MaintenanceRecord[] = []): MaintenanceRepository {
  const store = [...records];

  return {
    async listMaintenance(params) {
      let filtered = store;
      if (params.status) {
        filtered = filtered.filter((r) => r.status === params.status);
      }
      return {
        items: filtered,
        totalItems: filtered.length,
      };
    },

    async getMaintenanceById(id: string) {
      const row = store.find((r) => r.id === id);
      if (!row) return null;
      return {
        ...row,
        status: row.status as MaintenanceStatus,
        created_by: STAFF_ID,
      } as MaintenanceRecordRow;
    },

    async startMaintenance(params) {
      const newRec: MaintenanceRecord = {
        id: `maint-${Date.now()}`,
        projector_id: params.projectorId,
        reason: params.reason,
        note: params.note ?? null,
        status: "IN_PROGRESS",
        started_at: new Date().toISOString(),
        resolution_note: null,
        completed_at: null,
      };
      store.push(newRec);
      return newRec;
    },

    async completeMaintenance(params) {
      const rec = store.find((r) => r.id === params.maintenanceId);
      if (!rec) {
        throw new Error("Not found");
      }
      rec.status = "COMPLETED";
      rec.resolution_note = params.resolutionNote;
      rec.completed_at = new Date().toISOString();
      return rec;
    },
  };
}

describe("BE5 - Maintenance Service & Route Handlers", () => {
  it("rejects unauthenticated request with 401 on GET /api/v1/staff/maintenance", async () => {
    const sessionDeps = makeSessionDeps(null);

    const req = new Request("http://localhost:3000/api/v1/staff/maintenance");
    const res = await listMaintenanceRoute(req, { sessionDeps });
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });

  it("rejects non-staff user (KOMTING) with 403 on GET /api/v1/staff/maintenance", async () => {
    const komtingRow = makeUserRow({
      id: KOMTING_ID,
      auth_provider_user_id: `auth-${KOMTING_ID}`,
      role: "KOMTING",
      email: "komting@example.test",
    });
    const sessionDeps = makeSessionDeps(komtingRow);

    const req = new Request("http://localhost:3000/api/v1/staff/maintenance", {
      headers: { Authorization: "Bearer komting-token" },
    });
    const res = await listMaintenanceRoute(req, { sessionDeps });
    assert.equal(res.status, 403);

    const body = await res.json();
    assert.equal(body.error.code, "FORBIDDEN");
  });

  it("allows STAFF user and returns maintenance list with pagination", async () => {
    const staffRow = makeUserRow();
    const sessionDeps = makeSessionDeps(staffRow);

    const mockRepo = createMockMaintenanceRepo([
      {
        id: MAINT_ID,
        projector_id: PROJECTOR_ID,
        reason: "Lensa kotor dan kipas berisik",
        note: "Perlu dibersihkan teknisi",
        status: "IN_PROGRESS",
        started_at: "2026-11-26T10:00:00Z",
        resolution_note: null,
        completed_at: null,
      },
    ]);

    const req = new Request("http://localhost:3000/api/v1/staff/maintenance?page=1&page_size=20", {
      headers: { Authorization: "Bearer staff-token" },
    });
    const res = await listMaintenanceRoute(req, {
      sessionDeps,
      serviceDeps: { repository: mockRepo },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, MAINT_ID);
    assert.equal(body.data[0].status, "IN_PROGRESS");
    assert.equal(body.meta.pagination.total_items, 1);
  });

  it("filters maintenance list by status IN_PROGRESS and COMPLETED", async () => {
    const staffRow = makeUserRow();
    const sessionDeps = makeSessionDeps(staffRow);

    const mockRepo = createMockMaintenanceRepo([
      {
        id: "maint-1",
        projector_id: PROJECTOR_ID,
        reason: "Perbaikan port HDMI",
        note: null,
        status: "IN_PROGRESS",
        started_at: "2026-11-26T10:00:00Z",
        resolution_note: null,
        completed_at: null,
      },
      {
        id: "maint-2",
        projector_id: PROJECTOR_ID,
        reason: "Ganti lampu proyektor",
        note: null,
        status: "COMPLETED",
        started_at: "2026-11-25T10:00:00Z",
        resolution_note: "Lampu baru terpasang",
        completed_at: "2026-11-25T12:00:00Z",
      },
    ]);

    const reqInProgress = new Request(
      "http://localhost:3000/api/v1/staff/maintenance?status=IN_PROGRESS",
      { headers: { Authorization: "Bearer staff-token" } }
    );
    const resInProgress = await listMaintenanceRoute(reqInProgress, {
      sessionDeps,
      serviceDeps: { repository: mockRepo },
    });
    assert.equal(resInProgress.status, 200);
    const bodyInProgress = await resInProgress.json();
    assert.equal(bodyInProgress.data.length, 1);
    assert.equal(bodyInProgress.data[0].status, "IN_PROGRESS");

    const reqCompleted = new Request(
      "http://localhost:3000/api/v1/staff/maintenance?status=COMPLETED",
      { headers: { Authorization: "Bearer staff-token" } }
    );
    const resCompleted = await listMaintenanceRoute(reqCompleted, {
      sessionDeps,
      serviceDeps: { repository: mockRepo },
    });
    assert.equal(resCompleted.status, 200);
    const bodyCompleted = await resCompleted.json();
    assert.equal(bodyCompleted.data.length, 1);
    assert.equal(bodyCompleted.data[0].status, "COMPLETED");
  });

  it("validates input on POST /api/v1/staff/projectors/[projectorId]/maintenance", async () => {
    const staffRow = makeUserRow();
    const sessionDeps = makeSessionDeps(staffRow);

    const mockRepo = createMockMaintenanceRepo();

    // 1. Invalid UUID
    const reqInvalidUuid = new Request(
      `http://localhost:3000/api/v1/staff/projectors/invalid-uuid/maintenance`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Perbaikan port" }),
      }
    );
    const resInvalidUuid = await startMaintenanceRoute(reqInvalidUuid, {
      params: Promise.resolve({ projectorId: "invalid-uuid" }),
      sessionDeps,
      serviceDeps: { repository: mockRepo },
    });
    assert.equal(resInvalidUuid.status, 400);

    // 2. Reason too short (< 5 chars)
    const reqShortReason = new Request(
      `http://localhost:3000/api/v1/staff/projectors/${PROJECTOR_ID}/maintenance`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "fix" }),
      }
    );
    const resShortReason = await startMaintenanceRoute(reqShortReason, {
      params: Promise.resolve({ projectorId: PROJECTOR_ID }),
      sessionDeps,
      serviceDeps: { repository: mockRepo },
    });
    assert.equal(resShortReason.status, 422);

    // 3. Valid reason successfully creates maintenance record (status 201)
    const reqValid = new Request(
      `http://localhost:3000/api/v1/staff/projectors/${PROJECTOR_ID}/maintenance`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Kabel power longgar dan tombol macet",
          note: "Unit dibawa ke ruang teknisi",
        }),
      }
    );
    const resValid = await startMaintenanceRoute(reqValid, {
      params: Promise.resolve({ projectorId: PROJECTOR_ID }),
      sessionDeps,
      serviceDeps: { repository: mockRepo },
    });
    assert.equal(resValid.status, 201);
    const bodyValid = await resValid.json();
    assert.equal(bodyValid.data.projector_id, PROJECTOR_ID);
    assert.equal(bodyValid.data.status, "IN_PROGRESS");
    assert.equal(bodyValid.data.reason, "Kabel power longgar dan tombol macet");
  });

  it("validates input on POST /api/v1/staff/maintenance/[maintenanceId]/complete", async () => {
    const staffRow = makeUserRow();
    const sessionDeps = makeSessionDeps(staffRow);

    const mockRepo = createMockMaintenanceRepo([
      {
        id: MAINT_ID,
        projector_id: PROJECTOR_ID,
        reason: "Lensa buram",
        note: null,
        status: "IN_PROGRESS",
        started_at: "2026-11-26T10:00:00Z",
        resolution_note: null,
        completed_at: null,
      },
    ]);

    // 1. Missing resolution_note
    const reqMissingNote = new Request(
      `http://localhost:3000/api/v1/staff/maintenance/${MAINT_ID}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resolution_note: "   " }),
      }
    );
    const resMissingNote = await completeMaintenanceRoute(reqMissingNote, {
      params: Promise.resolve({ maintenanceId: MAINT_ID }),
      sessionDeps,
      serviceDeps: { repository: mockRepo },
    });
    assert.equal(resMissingNote.status, 422);

    // 2. Valid completion (status 200)
    const reqComplete = new Request(
      `http://localhost:3000/api/v1/staff/maintenance/${MAINT_ID}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resolution_note: "Lensa dibersihkan dan unit ditest normal.",
          set_projector_available: true,
        }),
      }
    );
    const resComplete = await completeMaintenanceRoute(reqComplete, {
      params: Promise.resolve({ maintenanceId: MAINT_ID }),
      sessionDeps,
      serviceDeps: { repository: mockRepo },
    });
    assert.equal(resComplete.status, 200);
    const bodyComplete = await resComplete.json();
    assert.equal(bodyComplete.data.status, "COMPLETED");
    assert.equal(
      bodyComplete.data.resolution_note,
      "Lensa dibersihkan dan unit ditest normal."
    );
  });
});

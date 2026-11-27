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

import { GET as komtingDashboardRoute } from "@/app/api/v1/komting/dashboard/route";
import { AuthError } from "@/lib/auth/errors";
import type { AuthClientLike, SessionDependencies } from "@/lib/auth/session";
import type { AuthUserRepository, SupabaseAuthIdentity } from "@/lib/auth/types";
import type { BookingRepository } from "@/lib/bookings/booking-service";
import type { LoanRepository } from "@/lib/loans/loan-service";
import type { ProjectorRepository } from "@/lib/projectors/projector-service";
import type {
  BookingRow,
  Database,
  Json,
  KomtingAssignmentRow,
  ProjectorRow,
  PublicUserRow,
} from "@/lib/supabase/database.types";

type LoanRow = Database["public"]["Tables"]["loans"]["Row"];

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const KOMTING_1_ID = "33333333-3333-4333-8333-333333333333";
const KOMTING_2_ID = "44444444-4444-4444-8444-444444444444";
const PROJECTOR_1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECTOR_2_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeUserRow(overrides: Partial<PublicUserRow> = {}): PublicUserRow {
  return {
    id: KOMTING_1_ID,
    auth_provider_user_id: `auth-${KOMTING_1_ID}`,
    email: "komting1@example.test",
    full_name: "Komting Satu",
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
    user_id: KOMTING_1_ID,
    class_name: "TI-3A",
    status: "ACTIVE",
    started_at: "2026-11-26T00:00:00Z",
    ended_at: null,
    created_by: ADMIN_ID,
    ended_by: null,
    end_reason: null,
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

function makeUserRepo(
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

function createMockDashboardDeps(options: {
  bookings?: BookingRow[];
  loans?: LoanRow[];
  projectors?: ProjectorRow[];
  throwDbError?: boolean;
} = {}) {
  const bookings = options.bookings ?? [];
  const loans = options.loans ?? [];
  const projectors = options.projectors ?? [];

  const bookingRepository: BookingRepository = {
    async createBookingAtomic() {
      throw new Error("Not implemented in mock");
    },
    async cancelBookingAtomic() {
      throw new Error("Not implemented in mock");
    },
    async findBookingById() {
      return null;
    },
    async listKomtingBookings({ komtingUserId, status, page, pageSize }) {
      if (options.throwDbError) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: "Database connection failed unexpectedly",
        });
      }
      const filtered = bookings.filter(
        (b) => b.komting_id === komtingUserId && (!status || b.status === status)
      );
      const offset = (page - 1) * pageSize;
      return {
        items: filtered.slice(offset, offset + pageSize),
        totalItems: filtered.length,
      };
    },
    async listStaffBookings() {
      return { items: [], totalItems: 0 };
    },
    async findStaffBookingDetail() {
      return null;
    },
  };

  const loanRepository: LoanRepository = {
    async confirmPickupAtomic() {
      throw new Error("Not implemented in mock");
    },
    async findLoanById() {
      return null;
    },
    async listStaffLoans() {
      return { items: [], totalItems: 0 };
    },
    async findStaffLoanDetail() {
      return null;
    },
    async listKomtingLoans({ komtingUserId, status, page, pageSize }) {
      if (options.throwDbError) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: "Database loan query failed",
        });
      }
      const filtered = loans.filter(
        (l) => l.komting_id === komtingUserId && (!status || l.status === status)
      );
      const offset = (page - 1) * pageSize;
      return {
        items: filtered.slice(offset, offset + pageSize).map((l) => ({
          id: l.id,
          booking_id: l.booking_id,
          projector_id: l.projector_id,
          komting_id: l.komting_id,
          status: l.status,
          picked_up_at: l.picked_up_at,
          returned_at: l.returned_at,
          return_condition: null,
        })),
        totalItems: filtered.length,
      };
    },
  };

  const projectorRepository: ProjectorRepository = {
    async listProjectors({ isActive, page, pageSize }) {
      if (options.throwDbError) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: "Database projector query failed",
        });
      }
      const filtered = projectors.filter((p) => (isActive === undefined ? true : p.is_active === isActive));
      const offset = (page - 1) * pageSize;
      return {
        items: filtered.slice(offset, offset + pageSize),
        totalItems: filtered.length,
      };
    },
    async getProjectorById(id: string) {
      return projectors.find((p) => p.id === id) ?? null;
    },
    async getOperationalFlags() {
      return { hasActiveLoan: false, hasActiveMaintenance: false };
    },
    async createProjector() {
      throw new Error("Not implemented in mock");
    },
    async updateProjector() {
      throw new Error("Not implemented in mock");
    },
    async deactivateProjectorAtomic() {
      throw new Error("Not implemented in mock");
    },
  };

  return {
    bookingServiceDeps: { repository: bookingRepository },
    loanServiceDeps: { repository: loanRepository },
    projectorServiceDeps: { repository: projectorRepository },
  };
}

describe("GET /api/v1/komting/dashboard Regression Tests", () => {
  it("1. KOMTING ACTIVE berhasil memperoleh dashboard", async () => {
    const userRow = makeUserRow({ id: KOMTING_1_ID });
    const assignmentRow = makeAssignmentRow({ user_id: KOMTING_1_ID, class_name: "TI-3A" });

    const bookingRow: BookingRow = {
      id: "booking-1",
      booking_code: "BKG-20261127-001",
      komting_id: KOMTING_1_ID,
      projector_id: PROJECTOR_1_ID,
      booking_date: "2026-11-27",
      start_time: "08:00:00",
      start_at: "2026-11-27T01:00:00Z",
      estimated_return_at: "2026-11-27T05:00:00Z",
      status: "CONFIRMED",
      operating_hours_snapshot: {} as Json,
      pickup_window_start_at: "2026-11-27T07:45:00Z",
      pickup_window_end_at: "2026-11-27T08:15:00Z",
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null,
      created_at: "2026-11-27T00:00:00Z",
      updated_at: "2026-11-27T00:00:00Z",
    };

    const loanRow: LoanRow = {
      id: "loan-1",
      booking_id: "booking-1",
      projector_id: PROJECTOR_1_ID,
      komting_id: KOMTING_1_ID,
      status: "ACTIVE",
      picked_up_at: "2026-11-27T01:10:00Z",
      pickup_processed_by: STAFF_ID,
      pickup_received_by: "KOMTING",
      representative_name: null,
      returned_at: null,
      return_processed_by: null,
      return_received_by: null,
      return_representative_name: null,
      lifecycle_seq: 1,
      created_at: "2026-11-27T01:10:00Z",
      updated_at: "2026-11-27T01:10:00Z",
    };

    const projectorRow: ProjectorRow = {
      id: PROJECTOR_1_ID,
      asset_code: "PRJ-01",
      name: "Epson EB-X500",
      brand: "Epson",
      model: "EB-X500",
      physical_status: "BORROWED",
      is_active: true,
      created_at: "2026-11-26T00:00:00Z",
      updated_at: "2026-11-26T00:00:00Z",
    };

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient({ id: `auth-${KOMTING_1_ID}`, email: userRow.email }),
      userRepository: makeUserRepo([userRow], [assignmentRow]),
    };

    const dashboardDeps = createMockDashboardDeps({
      bookings: [bookingRow],
      loans: [loanRow],
      projectors: [projectorRow],
    });

    const request = new Request("http://localhost:3000/api/v1/komting/dashboard", {
      headers: { Authorization: "Bearer valid-token-komting" },
    });

    const response = await komtingDashboardRoute(request, { sessionDeps, dashboardDeps });
    assert.equal(response.status, 200);

    const json = await response.json();
    assert.ok(json.data);
    assert.equal(json.data.active_assignment?.class_name, "TI-3A");
    assert.equal(json.data.active_assignment?.status, "ACTIVE");
    assert.equal(json.data.active_booking?.id, "booking-1");
    assert.equal(json.data.active_booking?.booking_code, "BKG-20261127-001");
    assert.equal(json.data.active_loan?.id, "loan-1");
    assert.equal(json.data.active_loan?.status, "ACTIVE");
    assert.equal(json.data.recent_bookings?.length, 1);
    assert.equal(json.data.relevant_projectors?.length, 1);
    assert.ok(Array.isArray(json.data.reminders));
    assert.ok(json.meta?.request_id);
  });

  it("2. KOMTING tanpa booking atau loan tetap memperoleh dashboard valid", async () => {
    const userRow = makeUserRow({ id: KOMTING_1_ID });
    const assignmentRow = makeAssignmentRow({ user_id: KOMTING_1_ID, class_name: "TI-3A" });

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient({ id: `auth-${KOMTING_1_ID}`, email: userRow.email }),
      userRepository: makeUserRepo([userRow], [assignmentRow]),
    };

    const dashboardDeps = createMockDashboardDeps({
      bookings: [],
      loans: [],
      projectors: [],
    });

    const request = new Request("http://localhost:3000/api/v1/komting/dashboard", {
      headers: { Authorization: "Bearer valid-token-komting" },
    });

    const response = await komtingDashboardRoute(request, { sessionDeps, dashboardDeps });
    assert.equal(response.status, 200);

    const json = await response.json();
    assert.ok(json.data);
    assert.equal(json.data.active_assignment?.class_name, "TI-3A");
    assert.equal(json.data.active_booking, null);
    assert.equal(json.data.active_loan, null);
    assert.deepEqual(json.data.recent_bookings, []);
    assert.deepEqual(json.data.relevant_projectors, []);
    assert.ok(Array.isArray(json.data.reminders));
  });

  it("3. KOMTING tidak dapat membaca data KOMTING lain", async () => {
    const user1 = makeUserRow({ id: KOMTING_1_ID, email: "komting1@example.test" });
    const user2 = makeUserRow({ id: KOMTING_2_ID, email: "komting2@example.test" });

    const bookingOfUser2: BookingRow = {
      id: "booking-of-user-2",
      booking_code: "BKG-OTHER-USER",
      komting_id: KOMTING_2_ID, // Owned by user 2!
      projector_id: PROJECTOR_2_ID,
      booking_date: "2026-11-27",
      start_time: "09:00:00",
      start_at: "2026-11-27T02:00:00Z",
      estimated_return_at: "2026-11-27T06:00:00Z",
      status: "CONFIRMED",
      operating_hours_snapshot: {} as Json,
      pickup_window_start_at: "2026-11-27T08:45:00Z",
      pickup_window_end_at: "2026-11-27T09:15:00Z",
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null,
      created_at: "2026-11-27T00:00:00Z",
      updated_at: "2026-11-27T00:00:00Z",
    };

    const loanOfUser2: LoanRow = {
      id: "loan-of-user-2",
      booking_id: "booking-of-user-2",
      projector_id: PROJECTOR_2_ID,
      komting_id: KOMTING_2_ID, // Owned by user 2!
      status: "ACTIVE",
      picked_up_at: "2026-11-27T02:10:00Z",
      pickup_processed_by: STAFF_ID,
      pickup_received_by: "KOMTING",
      representative_name: null,
      returned_at: null,
      return_processed_by: null,
      return_received_by: null,
      return_representative_name: null,
      lifecycle_seq: 1,
      created_at: "2026-11-27T02:10:00Z",
      updated_at: "2026-11-27T02:10:00Z",
    };

    // User 1 logs in
    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient({ id: `auth-${KOMTING_1_ID}`, email: user1.email }),
      userRepository: makeUserRepo([user1, user2], []),
    };

    const dashboardDeps = createMockDashboardDeps({
      bookings: [bookingOfUser2],
      loans: [loanOfUser2],
    });

    const request = new Request("http://localhost:3000/api/v1/komting/dashboard", {
      headers: { Authorization: "Bearer token-user-1" },
    });

    const response = await komtingDashboardRoute(request, { sessionDeps, dashboardDeps });
    assert.equal(response.status, 200);

    const json = await response.json();
    // KOMTING 1 must NOT see KOMTING 2's booking or loan
    assert.equal(json.data.active_booking, null);
    assert.equal(json.data.active_loan, null);
    assert.deepEqual(json.data.recent_bookings, []);
  });

  it("4. STAFF ditolak", async () => {
    const staffUser = makeUserRow({ id: STAFF_ID, role: "STAFF", email: "staff@example.test" });

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient({ id: `auth-${STAFF_ID}`, email: staffUser.email }),
      userRepository: makeUserRepo([staffUser]),
    };

    const request = new Request("http://localhost:3000/api/v1/komting/dashboard", {
      headers: { Authorization: "Bearer staff-token" },
    });

    const response = await komtingDashboardRoute(request, { sessionDeps });
    assert.equal(response.status, 403);

    const json = await response.json();
    assert.equal(json.error?.code, "FORBIDDEN");
  });

  it("5. ADMIN ditolak", async () => {
    const adminUser = makeUserRow({ id: ADMIN_ID, role: "ADMIN", email: "admin@example.test" });

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient({ id: `auth-${ADMIN_ID}`, email: adminUser.email }),
      userRepository: makeUserRepo([adminUser]),
    };

    const request = new Request("http://localhost:3000/api/v1/komting/dashboard", {
      headers: { Authorization: "Bearer admin-token" },
    });

    const response = await komtingDashboardRoute(request, { sessionDeps });
    assert.equal(response.status, 403);

    const json = await response.json();
    assert.equal(json.error?.code, "FORBIDDEN");
  });

  it("6. Pengguna INACTIVE ditolak", async () => {
    const inactiveUser = makeUserRow({
      id: KOMTING_1_ID,
      role: "KOMTING",
      account_status: "INACTIVE",
    });

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient({ id: `auth-${KOMTING_1_ID}`, email: inactiveUser.email }),
      userRepository: makeUserRepo([inactiveUser]),
    };

    const request = new Request("http://localhost:3000/api/v1/komting/dashboard", {
      headers: { Authorization: "Bearer inactive-token" },
    });

    const response = await komtingDashboardRoute(request, { sessionDeps });
    assert.equal(response.status, 403);

    const json = await response.json();
    assert.equal(json.error?.code, "ACCOUNT_NOT_ACTIVE");
  });

  it("7. Request tanpa token ditolak", async () => {
    const sessionDeps: SessionDependencies = {
      createServerClient: async () => makeAuthClient(null),
      createBearerClient: () => makeAuthClient(null),
      userRepository: makeUserRepo([]),
    };

    const request = new Request("http://localhost:3000/api/v1/komting/dashboard");

    const response = await komtingDashboardRoute(request, { sessionDeps });
    assert.equal(response.status, 401);

    const json = await response.json();
    assert.equal(json.error?.code, "AUTH_REQUIRED");
  });

  it("8. Error database ditangani dengan benar", async () => {
    const userRow = makeUserRow({ id: KOMTING_1_ID });

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient({ id: `auth-${KOMTING_1_ID}`, email: userRow.email }),
      userRepository: makeUserRepo([userRow]),
    };

    const dashboardDeps = createMockDashboardDeps({ throwDbError: true });

    const request = new Request("http://localhost:3000/api/v1/komting/dashboard", {
      headers: { Authorization: "Bearer komting-token" },
    });

    const response = await komtingDashboardRoute(request, { sessionDeps, dashboardDeps });
    assert.equal(response.status, 500);

    const json = await response.json();
    assert.equal(json.error?.code, "DATABASE_ERROR");
    assert.ok(json.meta?.request_id);
  });
});

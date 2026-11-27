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

import { GET as staffDashboardRoute } from "@/app/api/v1/staff/dashboard/route";
import type { AuthClientLike, SessionDependencies } from "@/lib/auth/session";
import type { AuthUserRepository, SupabaseAuthIdentity } from "@/lib/auth/types";
import type { BookingRepository, StaffBookingView } from "@/lib/bookings/booking-service";
import type { LoanRepository, StaffLoanView } from "@/lib/loans/loan-service";
import type { ProjectorRepository, StaffProjectorView } from "@/lib/projectors/projector-service";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ProjectorRow,
  PublicUserRow,
} from "@/lib/supabase/database.types";
import type { StaffDashboardSummary } from "@/types/domain";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const KOMTING_ID = "33333333-3333-4333-8333-333333333333";

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

function createMockDashboardDeps(options: {
  pendingPickups?: StaffBookingView[];
  bookingsTodayCount?: number;
  activeLoans?: StaffLoanView[];
  activeLoansWithBooking?: Array<{ id: string; bookings: { estimated_return_at: string } | null }>;
  maintenanceProjectors?: StaffProjectorView[];
  auditLogs?: Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
    actor_role: string;
  }>;
  now?: Date;
} = {}) {
  const pendingPickups = options.pendingPickups ?? [];
  const bookingsTodayCount = options.bookingsTodayCount ?? 0;
  const activeLoans = options.activeLoans ?? [];
  const maintenanceProjectors = options.maintenanceProjectors ?? [];

  const bookingRepo: BookingRepository = {
    async createBookingAtomic() {
      throw new Error("Not implemented");
    },
    async cancelBookingAtomic() {
      throw new Error("Not implemented");
    },
    async findBookingById() {
      return null;
    },
    async listKomtingBookings() {
      return { items: [], totalItems: 0 };
    },
    async listStaffBookings(params) {
      if (params.status === "CONFIRMED") {
        return {
          items: pendingPickups,
          totalItems: pendingPickups.length,
        };
      }
      if (params.date) {
        return {
          items: [],
          totalItems: bookingsTodayCount,
        };
      }
      return { items: [], totalItems: 0 };
    },
    async findStaffBookingDetail() {
      return null;
    },
  };

  const loanRepo: LoanRepository = {
    async confirmPickupAtomic() {
      throw new Error("Not implemented");
    },
    async findLoanById() {
      return null;
    },
    async listStaffLoans(params) {
      if (params.status === "ACTIVE") {
        return {
          items: activeLoans,
          totalItems: activeLoans.length,
        };
      }
      return { items: [], totalItems: 0 };
    },
    async findStaffLoanDetail() {
      return null;
    },
    async listKomtingLoans() {
      return { items: [], totalItems: 0 };
    },
  };

  const projectorRepo: ProjectorRepository = {
    async listProjectors(params) {
      if (params.physicalStatus === "MAINTENANCE") {
        return {
          items: maintenanceProjectors as unknown as ProjectorRow[],
          totalItems: maintenanceProjectors.length,
        };
      }
      return { items: [], totalItems: 0 };
    },
    async getProjectorById() {
      return null;
    },
    async getOperationalFlags() {
      return { hasActiveLoan: false, hasActiveMaintenance: false };
    },
    async createProjector() {
      throw new Error("Not implemented");
    },
    async updateProjector() {
      throw new Error("Not implemented");
    },
    async deactivateProjectorAtomic() {
      throw new Error("Not implemented");
    },
  };

  const adminClient = {
    from(table: string) {
      if (table === "loans") {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({
                  data: options.activeLoansWithBooking ?? [],
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === "audit_logs") {
        return {
          select() {
            return {
              order() {
                return {
                  limit() {
                    return Promise.resolve({
                      data: options.auditLogs ?? [],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      return {
        select() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  } as unknown as ReturnType<typeof createSupabaseAdminClient>;

  return {
    bookingRepo,
    loanRepo,
    projectorRepo,
    adminClient,
    nowProvider: options.now ? () => options.now! : undefined,
  };
}

describe("GET /api/v1/staff/dashboard - Unit Regression Tests", () => {
  it("1. STAFF gets HTTP 200 with complete StaffDashboardSummary envelope", async () => {
    const staffRow = makeUserRow({ id: STAFF_ID, role: "STAFF" });
    const authIdentity: SupabaseAuthIdentity = {
      id: staffRow.auth_provider_user_id!,
      email: staffRow.email,
    };

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient(authIdentity),
      createServerClient: async () => makeAuthClient(authIdentity),
      userRepository: makeUserRepo([staffRow]),
    };

    const mockPending: StaffBookingView = {
      id: "bkg-uuid-1",
      booking_code: "BKG-20261127-1001",
      komting_id: KOMTING_ID,
      projector_id: "prj-uuid-1",
      booking_date: "2026-11-27",
      start_time: "09:00:00",
      estimated_return_at: "2026-11-27T04:00:00Z",
      status: "CONFIRMED",
      pickup_window: {
        opens_at: "2026-11-27T01:30:00Z",
        closes_at: "2026-11-27T02:15:00Z",
      },
      created_at: "2026-11-27T01:00:00Z",
      komting: { id: KOMTING_ID, full_name: "Mahasiswa Komting", email: "komting@kampus.test" },
      projector: {
        id: "prj-uuid-1",
        asset_code: "PRJ-001",
        name: "Epson EB-X400",
        brand: "Epson",
        model: "EB-X400",
        physical_status: "AVAILABLE",
      },
    };

    const dashboardDeps = createMockDashboardDeps({
      pendingPickups: [mockPending],
      bookingsTodayCount: 5,
      activeLoans: [],
      maintenanceProjectors: [],
    });

    const req = new Request("http://localhost:3000/api/v1/staff/dashboard", {
      headers: { Authorization: "Bearer staff-token" },
    });

    const res = await staffDashboardRoute(req, { sessionDeps, dashboardDeps });
    assert.equal(res.status, 200);

    const body = (await res.json()) as { data: StaffDashboardSummary; meta: { request_id: string } };
    assert.ok(body.data);
    assert.ok(body.meta?.request_id);
    assert.equal(body.data.bookings_today_count, 5);
    assert.equal(body.data.pending_pickup_count, 1);
    assert.equal(body.data.pending_pickups?.length, 1);
    assert.equal(body.data.pending_pickups?.[0]?.booking_code, "BKG-20261127-1001");
  });

  it("2. ADMIN gets HTTP 200", async () => {
    const adminRow = makeUserRow({ id: ADMIN_ID, role: "ADMIN", email: "admin@example.test" });
    const authIdentity: SupabaseAuthIdentity = {
      id: adminRow.auth_provider_user_id!,
      email: adminRow.email,
    };

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient(authIdentity),
      createServerClient: async () => makeAuthClient(authIdentity),
      userRepository: makeUserRepo([adminRow]),
    };

    const dashboardDeps = createMockDashboardDeps();

    const req = new Request("http://localhost:3000/api/v1/staff/dashboard", {
      headers: { Authorization: "Bearer admin-token" },
    });

    const res = await staffDashboardRoute(req, { sessionDeps, dashboardDeps });
    assert.equal(res.status, 200);

    const body = (await res.json()) as { data: StaffDashboardSummary; meta: { request_id: string } };
    assert.ok(body.data);
    assert.ok(body.meta?.request_id);
  });

  it("3. KOMTING gets HTTP 403 Forbidden", async () => {
    const komtingRow = makeUserRow({ id: KOMTING_ID, role: "KOMTING", email: "komting@example.test" });
    const authIdentity: SupabaseAuthIdentity = {
      id: komtingRow.auth_provider_user_id!,
      email: komtingRow.email,
    };

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient(authIdentity),
      createServerClient: async () => makeAuthClient(authIdentity),
      userRepository: makeUserRepo([komtingRow]),
    };

    const req = new Request("http://localhost:3000/api/v1/staff/dashboard", {
      headers: { Authorization: "Bearer komting-token" },
    });

    const res = await staffDashboardRoute(req, { sessionDeps });
    assert.equal(res.status, 403);

    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error?.code, "FORBIDDEN");
  });

  it("4. Unauthenticated request gets HTTP 401 Unauthorized", async () => {
    const sessionDeps: SessionDependencies = {
      createServerClient: async () => makeAuthClient(null),
      createBearerClient: () => makeAuthClient(null),
      userRepository: makeUserRepo([]),
    };

    const req = new Request("http://localhost:3000/api/v1/staff/dashboard");
    const res = await staffDashboardRoute(req, { sessionDeps });
    assert.equal(res.status, 401);

    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error?.code, "AUTH_REQUIRED");
  });

  it("5. Response structure matches StaffDashboardSummary contract", async () => {
    const staffRow = makeUserRow({ id: STAFF_ID, role: "STAFF" });
    const authIdentity: SupabaseAuthIdentity = {
      id: staffRow.auth_provider_user_id!,
      email: staffRow.email,
    };

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient(authIdentity),
      createServerClient: async () => makeAuthClient(authIdentity),
      userRepository: makeUserRepo([staffRow]),
    };

    const dashboardDeps = createMockDashboardDeps({
      auditLogs: [
        {
          id: "log-1",
          action: "LOAN_PICKUP_CONFIRMED",
          entity_type: "LOAN",
          entity_id: "loan-1",
          created_at: "2026-11-27T08:00:00Z",
          actor_role: "STAFF",
        },
      ],
    });

    const req = new Request("http://localhost:3000/api/v1/staff/dashboard", {
      headers: { Authorization: "Bearer staff-token" },
    });

    const res = await staffDashboardRoute(req, { sessionDeps, dashboardDeps });
    assert.equal(res.status, 200);

    const body = (await res.json()) as { data: StaffDashboardSummary };
    const data = body.data;

    // Check all required contract fields exist
    assert.equal(typeof data.bookings_today_count, "number");
    assert.equal(typeof data.pending_pickup_count, "number");
    assert.equal(typeof data.active_loans_count, "number");
    assert.equal(typeof data.overdue_loans_count, "number");
    assert.equal(typeof data.maintenance_units_count, "number");
    assert.ok(Array.isArray(data.pending_pickups));
    assert.ok(Array.isArray(data.active_loans));
    assert.ok(Array.isArray(data.maintenance_units));
    assert.ok(Array.isArray(data.recent_activities));
    assert.equal(data.recent_activities?.length, 1);
    assert.equal(data.recent_activities?.[0]?.id, "log-1");
    assert.ok(data.recent_activities?.[0]?.message.includes("pickup"));
  });

  it("6. Calculations for bookings, active loans, overdue, and maintenance are accurate", async () => {
    const staffRow = makeUserRow({ id: STAFF_ID, role: "STAFF" });
    const authIdentity: SupabaseAuthIdentity = {
      id: staffRow.auth_provider_user_id!,
      email: staffRow.email,
    };

    const sessionDeps: SessionDependencies = {
      createBearerClient: () => makeAuthClient(authIdentity),
      createServerClient: async () => makeAuthClient(authIdentity),
      userRepository: makeUserRepo([staffRow]),
    };

    const testNow = new Date("2026-11-27T10:00:00.000Z");

    const mockActiveLoans: StaffLoanView[] = [
      {
        id: "loan-1",
        booking_id: "bkg-1",
        projector_id: "prj-1",
        komting_id: KOMTING_ID,
        status: "ACTIVE",
        picked_up_at: "2026-11-27T08:00:00Z",
        returned_at: null,
        return_condition: null,
        komting: { id: KOMTING_ID, full_name: "Mahasiswa Komting", email: "komting@kampus.test" },
        projector: {
          id: "prj-1",
          asset_code: "PRJ-001",
          name: "Epson EB-X400",
          brand: "Epson",
          model: "EB-X400",
          physical_status: "BORROWED",
        },
      },
      {
        id: "loan-2",
        booking_id: "bkg-2",
        projector_id: "prj-2",
        komting_id: KOMTING_ID,
        status: "ACTIVE",
        picked_up_at: "2026-11-27T08:30:00Z",
        returned_at: null,
        return_condition: null,
        komting: { id: KOMTING_ID, full_name: "Mahasiswa Komting", email: "komting@kampus.test" },
        projector: {
          id: "prj-2",
          asset_code: "PRJ-002",
          name: "Sony VPL",
          brand: "Sony",
          model: "VPL",
          physical_status: "BORROWED",
        },
      },
    ];

    // loan-1 estimated_return_at is 09:00 (past testNow 10:00 -> OVERDUE)
    // loan-2 estimated_return_at is 11:00 (after testNow 10:00 -> NOT overdue)
    const mockActiveLoansWithBooking = [
      { id: "loan-1", bookings: { estimated_return_at: "2026-11-27T09:00:00.000Z" } },
      { id: "loan-2", bookings: { estimated_return_at: "2026-11-27T11:00:00.000Z" } },
    ];

    const mockMaintenanceProjectors: StaffProjectorView[] = [
      {
        id: "prj-m1",
        asset_code: "PRJ-M01",
        name: "Proyektor Rusak 1",
        brand: "Sony",
        model: "VPL",
        physical_status: "MAINTENANCE",
        is_active: true,
      },
      {
        id: "prj-m2",
        asset_code: "PRJ-M02",
        name: "Proyektor Rusak 2",
        brand: "Epson",
        model: "X",
        physical_status: "MAINTENANCE",
        is_active: true,
      },
      {
        id: "prj-m3",
        asset_code: "PRJ-M03",
        name: "Proyektor Rusak 3",
        brand: "BenQ",
        model: "B",
        physical_status: "MAINTENANCE",
        is_active: true,
      },
    ];

    const dashboardDeps = createMockDashboardDeps({
      bookingsTodayCount: 7,
      activeLoans: mockActiveLoans,
      activeLoansWithBooking: mockActiveLoansWithBooking,
      maintenanceProjectors: mockMaintenanceProjectors,
      now: testNow,
    });

    const req = new Request("http://localhost:3000/api/v1/staff/dashboard", {
      headers: { Authorization: "Bearer staff-token" },
    });

    const res = await staffDashboardRoute(req, { sessionDeps, dashboardDeps });
    assert.equal(res.status, 200);

    const body = (await res.json()) as { data: StaffDashboardSummary };
    const data = body.data;

    assert.equal(data.bookings_today_count, 7, "bookings_today_count must be 7");
    assert.equal(data.active_loans_count, 2, "active_loans_count must be 2");
    assert.equal(data.overdue_loans_count, 1, "overdue_loans_count must be 1 (loan-1 is past 09:00)");
    assert.equal(data.maintenance_units_count, 3, "maintenance_units_count must be 3");
    assert.equal(data.maintenance_units?.length, 3);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { BookingRow, OperatingHoursRow, ProjectorRow } from "@/lib/supabase/database.types";
import { GET as availabilityGetRoute } from "@/app/api/v1/availability/route";
import { PUT as adminOperatingHoursPutRoute } from "@/app/api/v1/admin/operating-hours/[date]/route";
import { POST as adminProjectorCreateRoute } from "@/app/api/v1/admin/projectors/route";
import { PATCH as adminProjectorPatchRoute } from "@/app/api/v1/admin/projectors/[projectorId]/route";
import { POST as adminProjectorDeactivateRoute } from "@/app/api/v1/admin/projectors/[projectorId]/deactivate/route";
import { GET as operatingHoursGetRoute } from "@/app/api/v1/operating-hours/route";
import { GET as projectorDetailRoute } from "@/app/api/v1/projectors/[projectorId]/route";
import { GET as projectorsListRoute } from "@/app/api/v1/projectors/route";
import {
  checkProjectorAvailability,
  type AvailabilityRepository,
} from "@/lib/availability/availability-service";
import {
  getOperatingHoursForDate,
  updateOperatingHoursForDate,
  type OperatingHoursRepository,
} from "@/lib/operating-hours/operating-hours-service";
import {
  createProjector,
  deactivateProjector,
  getProjectorDetail,
  listProjectors,
  updateProjector,
  type ProjectorRepository,
} from "@/lib/projectors/projector-service";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const KOMTING_ID = "33333333-3333-4333-8333-333333333333";
const PROJECTOR_1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECTOR_2_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

function makeProjectorRow(overrides: Partial<ProjectorRow> = {}): ProjectorRow {
  return {
    id: PROJECTOR_1_ID,
    asset_code: "PRJ-001",
    name: "Epson EB-X500",
    brand: "Epson",
    model: "EB-X500",
    physical_status: "AVAILABLE",
    is_active: true,
    created_at: "2026-11-26T00:00:00.000Z",
    updated_at: "2026-11-26T00:00:00.000Z",
    ...overrides,
  };
}

function makeStatefulStore() {
  const projectors: ProjectorRow[] = [
    makeProjectorRow(),
    makeProjectorRow({
      id: PROJECTOR_2_ID,
      asset_code: "PRJ-002",
      name: "BenQ MS550",
      brand: "BenQ",
      model: "MS550",
      physical_status: "MAINTENANCE",
      is_active: true,
    }),
  ];
  const operatingHours = new Map<string, OperatingHoursRow>();
  const bookings: Array<
    Pick<
      BookingRow,
      | "id"
      | "booking_code"
      | "projector_id"
      | "booking_date"
      | "start_time"
      | "start_at"
      | "estimated_return_at"
      | "status"
    >
  > = [];
  const activeLoanProjectors = new Set<string>();
  const activeMaintProjectors = new Set<string>([PROJECTOR_2_ID]);

  const projectorRepo: ProjectorRepository = {
    async listProjectors({ physicalStatus, isActive, page, pageSize }) {
      const filtered = projectors.filter((p) => {
        if (physicalStatus && p.physical_status !== physicalStatus) return false;
        if (typeof isActive === "boolean" && p.is_active !== isActive) return false;
        return true;
      });
      const offset = (page - 1) * pageSize;
      return {
        items: filtered.slice(offset, offset + pageSize),
        totalItems: filtered.length,
      };
    },
    async getProjectorById(id) {
      return projectors.find((p) => p.id === id) ?? null;
    },
    async getOperationalFlags(id) {
      return {
        hasActiveLoan: activeLoanProjectors.has(id),
        hasActiveMaintenance: activeMaintProjectors.has(id),
      };
    },
    async createProjector({ assetCode, name, brand, model }) {
      const dup = projectors.find(
        (p) => p.asset_code.trim().toLowerCase() === assetCode.trim().toLowerCase()
      );
      if (dup) {
        throw new AuthError({
          status: 409,
          code: "INVALID_REQUEST",
          message: "Kode aset proyektor sudah terdaftar.",
          details: [{ field: "asset_code", reason: "ALREADY_EXISTS" }],
        });
      }
      const created = makeProjectorRow({
        id: crypto.randomUUID(),
        asset_code: assetCode,
        name,
        brand,
        model,
      });
      projectors.push(created);
      return created;
    },
    async updateProjector({ projectorId, patch }) {
      const idx = projectors.findIndex((p) => p.id === projectorId);
      if (idx === -1) return null;
      const updated = { ...projectors[idx]!, ...patch, updated_at: new Date().toISOString() };
      projectors[idx] = updated;
      return updated;
    },
    async deactivateProjectorAtomic({ projectorId }) {
      const idx = projectors.findIndex((p) => p.id === projectorId);
      if (idx === -1) {
        throw new AuthError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: "Unit proyektor tidak ditemukan.",
        });
      }
      const proj = projectors[idx]!;
      if (!proj.is_active || proj.physical_status === "INACTIVE") {
        throw new AuthError({
          status: 409,
          code: "PROJECTOR_NOT_BOOKABLE",
          message: "Unit proyektor sudah berstatus nonaktif.",
        });
      }
      if (activeLoanProjectors.has(projectorId) || proj.physical_status === "BORROWED") {
        throw new AuthError({
          status: 409,
          code: "PROJECTOR_HAS_ACTIVE_LOAN",
          message: "Unit proyektor tidak dapat dinonaktifkan karena masih memiliki loan aktif.",
        });
      }
      if (activeMaintProjectors.has(projectorId) || proj.physical_status === "MAINTENANCE") {
        throw new AuthError({
          status: 409,
          code: "PROJECTOR_NOT_BOOKABLE",
          message: "Unit proyektor masih memiliki catatan maintenance yang sedang berlangsung.",
        });
      }
      const hasConfirmed = bookings.some(
        (b) => b.projector_id === projectorId && b.status === "CONFIRMED"
      );
      if (hasConfirmed) {
        throw new AuthError({
          status: 409,
          code: "BOOKING_CONFLICT",
          message: "Unit proyektor masih memiliki booking aktif.",
        });
      }
      const updated: ProjectorRow = {
        ...proj,
        is_active: false,
        physical_status: "INACTIVE",
      };
      projectors[idx] = updated;
      return {
        id: updated.id,
        asset_code: updated.asset_code,
        name: updated.name,
        brand: updated.brand,
        model: updated.model,
        physical_status: updated.physical_status,
        is_active: updated.is_active,
      };
    },
  };

  const hoursRepo: OperatingHoursRepository = {
    async getByServiceDate(serviceDate) {
      return operatingHours.get(serviceDate) ?? null;
    },
    async upsertOperatingHoursAtomic({
      serviceDate,
      opensAt,
      closesAt,
      adminEarlyOpenAt,
      note,
      adminUserId,
    }) {
      const conflicts = bookings
        .filter((b) => b.booking_date === serviceDate && b.status === "CONFIRMED")
        .filter((b) => {
          const endWib = new Date(new Date(b.estimated_return_at).getTime() + 7 * 3600 * 1000)
            .toISOString()
            .slice(11, 19);
          return b.start_time < opensAt || endWib > closesAt;
        });

      if (conflicts.length > 0) {
        return {
          conflict: true,
          conflicting_bookings: conflicts.map((c) => ({
            booking_id: c.id,
            booking_code: c.booking_code,
            projector_id: c.projector_id,
            start_time: c.start_time,
            estimated_return_at: c.estimated_return_at,
          })),
        };
      }

      const row: OperatingHoursRow = {
        id: operatingHours.get(serviceDate)?.id ?? crypto.randomUUID(),
        service_date: serviceDate,
        timezone: "Asia/Jakarta",
        opens_at: opensAt,
        closes_at: closesAt,
        admin_early_open_at: adminEarlyOpenAt,
        note,
        created_by: operatingHours.get(serviceDate)?.created_by ?? adminUserId,
        updated_by: adminUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      operatingHours.set(serviceDate, row);

      return {
        conflict: false,
        operating_hours: {
          id: row.id,
          service_date: row.service_date,
          timezone: row.timezone,
          opens_at: row.opens_at,
          closes_at: row.closes_at,
          admin_early_open_at: row.admin_early_open_at,
          note: row.note,
        },
      };
    },
  };

  const availabilityRepo: AvailabilityRepository = {
    async getProjectorById(id) {
      return projectors.find((p) => p.id === id) ?? null;
    },
    async getOperatingHoursByDate(serviceDate) {
      return operatingHours.get(serviceDate) ?? null;
    },
    async listConfirmedBookingsForProjectorDate(projectorId, serviceDate) {
      return bookings
        .filter(
          (b) =>
            b.projector_id === projectorId &&
            b.booking_date === serviceDate &&
            b.status === "CONFIRMED"
        )
        .map((b) => ({
          start_time: b.start_time,
          start_at: b.start_at,
          estimated_return_at: b.estimated_return_at,
        }));
    },
  };

  return {
    projectors,
    operatingHours,
    bookings,
    activeLoanProjectors,
    activeMaintProjectors,
    projectorRepo,
    hoursRepo,
    availabilityRepo,
  };
}

describe("BE-3 Route Handlers: Unauthenticated Boundaries", () => {
  it("rejects unauthenticated requests across all 8 BE-3 routes with 401 AUTH_REQUIRED", async () => {
    const req = (url: string, method = "GET") =>
      new Request(url, { method, headers: { Authorization: "Basic invalid" } });

    const responses = await Promise.all([
      projectorsListRoute(req("http://localhost:3000/api/v1/projectors")),
      projectorDetailRoute(req(`http://localhost:3000/api/v1/projectors/${PROJECTOR_1_ID}`), {
        params: Promise.resolve({ projectorId: PROJECTOR_1_ID }),
      }),
      adminProjectorCreateRoute(req("http://localhost:3000/api/v1/admin/projectors", "POST")),
      adminProjectorPatchRoute(
        req(`http://localhost:3000/api/v1/admin/projectors/${PROJECTOR_1_ID}`, "PATCH"),
        { params: Promise.resolve({ projectorId: PROJECTOR_1_ID }) }
      ),
      adminProjectorDeactivateRoute(
        req(`http://localhost:3000/api/v1/admin/projectors/${PROJECTOR_1_ID}/deactivate`, "POST"),
        { params: Promise.resolve({ projectorId: PROJECTOR_1_ID }) }
      ),
      operatingHoursGetRoute(req("http://localhost:3000/api/v1/operating-hours?date=2026-11-27")),
      adminOperatingHoursPutRoute(
        req("http://localhost:3000/api/v1/admin/operating-hours/2026-11-27", "PUT"),
        { params: Promise.resolve({ date: "2026-11-27" }) }
      ),
      availabilityGetRoute(
        req(
          `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_1_ID}&date=2026-11-27`
        )
      ),
    ]);

    for (const res of responses) {
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "AUTH_REQUIRED");
    }
  });
});

describe("BE-3 Projector Inventory Service", () => {
  it("lists and gets projector details with role-scoped visibility and validates UUID/404", async () => {
    const store = makeStatefulStore();
    const komting = makeContext("KOMTING");
    const staff = makeContext("STAFF");

    const listKomting = await listProjectors(
      komting,
      "http://localhost:3000/api/v1/projectors?physical_status=AVAILABLE&page=1&page_size=10",
      { repository: store.projectorRepo }
    );
    assert.equal(listKomting.items.length, 1);
    assert.equal(listKomting.items[0]?.asset_code, "PRJ-001");
    assert.equal("created_at" in listKomting.items[0]!, false);

    const detailStaff = await getProjectorDetail(staff, PROJECTOR_1_ID, {
      repository: store.projectorRepo,
    });
    assert.equal(detailStaff.id, PROJECTOR_1_ID);
    assert.equal(detailStaff.has_active_loan, false);
    assert.ok(detailStaff.created_at);

    await assert.rejects(
      () => getProjectorDetail(komting, "not-a-uuid", { repository: store.projectorRepo }),
      (err: unknown) =>
        err instanceof AuthError && err.status === 400 && err.code === "INVALID_REQUEST"
    );

    await assert.rejects(
      () =>
        getProjectorDetail(komting, "99999999-9999-4999-8999-999999999999", {
          repository: store.projectorRepo,
        }),
      (err: unknown) =>
        err instanceof AuthError && err.status === 404 && err.code === "PROJECTOR_NOT_FOUND"
    );
  });

  it("creates, updates, enforces allowlists, prevents duplicate asset_code, and deactivates safely", async () => {
    const store = makeStatefulStore();
    const admin = makeContext("ADMIN");

    const created = await createProjector(
      admin,
      { asset_code: "PRJ-003", name: "NEC NP-VE303", brand: "NEC", model: "NP-VE303" },
      "req-1",
      { repository: store.projectorRepo }
    );
    assert.equal(created.asset_code, "PRJ-003");
    assert.equal(created.physical_status, "AVAILABLE");
    assert.equal(created.is_active, true);

    await assert.rejects(
      () =>
        createProjector(admin, { asset_code: "prj-003", name: "Dup" }, "req-2", {
          repository: store.projectorRepo,
        }),
      (err: unknown) => err instanceof AuthError && err.status === 409
    );

    // Reject physical_status bypass on PATCH
    await assert.rejects(
      () =>
        updateProjector(
          admin,
          created.id,
          { name: "Renamed", physical_status: "MAINTENANCE" },
          "req-3",
          { repository: store.projectorRepo }
        ),
      (err: unknown) => err instanceof AuthError && err.status === 400
    );

    const updated = await updateProjector(
      admin,
      created.id,
      { name: "NEC Upgraded", model: "VE303X" },
      "req-4",
      { repository: store.projectorRepo }
    );
    assert.equal(updated.name, "NEC Upgraded");
    assert.equal(updated.model, "VE303X");

    // Block deactivation when ACTIVE loan exists
    store.activeLoanProjectors.add(created.id);
    await assert.rejects(
      () =>
        deactivateProjector(admin, created.id, { reason: "Retired" }, "req-5", {
          repository: store.projectorRepo,
        }),
      (err: unknown) =>
        err instanceof AuthError && err.status === 409 && err.code === "PROJECTOR_HAS_ACTIVE_LOAN"
    );
    store.activeLoanProjectors.delete(created.id);

    // Succeed when no active transactions
    const deactivated = await deactivateProjector(admin, created.id, null, "req-6", {
      repository: store.projectorRepo,
    });
    assert.equal(deactivated.is_active, false);
    assert.equal(deactivated.physical_status, "INACTIVE");
  });
});

describe("BE-3 Operating Hours Service", () => {
  it("returns standard defaults when unconfigured and persists custom hours + early open", async () => {
    const store = makeStatefulStore();
    const admin = makeContext("ADMIN");

    const defHours = await getOperatingHoursForDate(
      "http://localhost:3000/api/v1/operating-hours?date=2026-11-27",
      { repository: store.hoursRepo }
    );
    assert.equal(defHours.opens_at, "08:00:00");
    assert.equal(defHours.closes_at, "17:00:00");
    assert.equal(defHours.early_pickup_allowed_at, "07:45:00");

    const updated = await updateOperatingHoursForDate(
      admin,
      "2026-11-27",
      {
        opens_at: "08:00:00",
        closes_at: "18:00:00",
        admin_early_open_at: "07:00:00",
        note: "Buka awal untuk seminar",
      },
      "req-oh-1",
      { repository: store.hoursRepo }
    );
    assert.equal(updated.closes_at, "18:00:00");
    assert.equal(updated.early_pickup_allowed_at, "07:30:00");
    assert.equal(updated.admin_early_open_at, "07:00:00");
    assert.equal(updated.note, "Buka awal untuk seminar");

    const reloaded = await getOperatingHoursForDate(
      "http://localhost:3000/api/v1/operating-hours?date=2026-11-27",
      { repository: store.hoursRepo }
    );
    assert.equal(reloaded.admin_early_open_at, "07:00:00");
    assert.equal(reloaded.note, "Buka awal untuk seminar");
  });

  it("rejects invalid dates/windows and returns 409 OPERATING_HOURS_CONFLICT when CONFIRMED booking conflicts", async () => {
    const store = makeStatefulStore();
    const admin = makeContext("ADMIN");

    await assert.rejects(
      () =>
        getOperatingHoursForDate("http://localhost:3000/api/v1/operating-hours?date=2026-02-30", {
          repository: store.hoursRepo,
        }),
      (err: unknown) => err instanceof AuthError && err.status === 400
    );

    await assert.rejects(
      () =>
        updateOperatingHoursForDate(
          admin,
          "2026-11-27",
          { opens_at: "17:00:00", closes_at: "08:00:00", admin_early_open_at: null, note: null },
          "req-oh-bad",
          { repository: store.hoursRepo }
        ),
      (err: unknown) => err instanceof AuthError && err.status === 422
    );

    // Add CONFIRMED booking from 09:00 to 16:00 WIB on 2026-11-27
    store.bookings.push({
      id: crypto.randomUUID(),
      booking_code: "BKG-20261127-001",
      projector_id: PROJECTOR_1_ID,
      booking_date: "2026-11-27",
      start_time: "09:00:00",
      start_at: "2026-11-27T02:00:00.000Z",
      estimated_return_at: "2026-11-27T09:00:00.000Z", // 16:00 WIB
      status: "CONFIRMED",
    });

    // Narrow closing time to 15:00:00 -> must reject with 409 OPERATING_HOURS_CONFLICT & not cancel booking
    await assert.rejects(
      () =>
        updateOperatingHoursForDate(
          admin,
          "2026-11-27",
          { opens_at: "08:00:00", closes_at: "15:00:00", admin_early_open_at: null, note: null },
          "req-oh-conflict",
          { repository: store.hoursRepo }
        ),
      (err: unknown) =>
        err instanceof AuthError &&
        err.status === 409 &&
        err.code === "OPERATING_HOURS_CONFLICT" &&
        err.details?.[0]?.field === "BKG-20261127-001"
    );

    assert.equal(store.bookings[0]?.status, "CONFIRMED");
  });
});

describe("BE-3 Availability Service", () => {
  const fixedNowTodayMorning = new Date("2026-11-26T01:30:00.000Z"); // 08:30 WIB on 2026-11-26

  it("rejects invalid projector_id, invalid date, and missing projector", async () => {
    const store = makeStatefulStore();

    await assert.rejects(
      () =>
        checkProjectorAvailability(
          "http://localhost:3000/api/v1/availability?projector_id=bad&date=2026-11-27",
          { repository: store.availabilityRepo, now: fixedNowTodayMorning }
        ),
      (err: unknown) => err instanceof AuthError && err.status === 400
    );

    await assert.rejects(
      () =>
        checkProjectorAvailability(
          `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_1_ID}&date=2026-99-99`,
          { repository: store.availabilityRepo, now: fixedNowTodayMorning }
        ),
      (err: unknown) => err instanceof AuthError && err.status === 400
    );

    await assert.rejects(
      () =>
        checkProjectorAvailability(
          "http://localhost:3000/api/v1/availability?projector_id=99999999-9999-4999-8999-999999999999&date=2026-11-27",
          { repository: store.availabilityRepo, now: fixedNowTodayMorning }
        ),
      (err: unknown) =>
        err instanceof AuthError && err.status === 404 && err.code === "PROJECTOR_NOT_FOUND"
    );
  });

  it("handles active, maintenance, inactive, BORROWED (today vs tomorrow), partial booking, and full-day booking", async () => {
    const store = makeStatefulStore();

    // 1. Available unit for tomorrow (no bookings)
    const availTomorrow = await checkProjectorAvailability(
      `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_1_ID}&date=2026-11-27`,
      { repository: store.availabilityRepo, now: fixedNowTodayMorning }
    );
    assert.equal(availTomorrow.is_bookable, true);
    assert.equal(availTomorrow.booked_slots.length, 0);
    assert.deepEqual(availTomorrow.available_windows, [
      { start_time: "08:00:00", end_time: "17:00:00" },
    ]);

    // 2. Maintenance unit is not bookable
    const maintAvail = await checkProjectorAvailability(
      `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_2_ID}&date=2026-11-27`,
      { repository: store.availabilityRepo, now: fixedNowTodayMorning }
    );
    assert.equal(maintAvail.is_bookable, false);
    assert.equal(maintAvail.physical_status, "MAINTENANCE");

    // 3. Inactive unit is not bookable
    store.projectors[0]!.is_active = false;
    store.projectors[0]!.physical_status = "INACTIVE";
    const inactiveAvail = await checkProjectorAvailability(
      `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_1_ID}&date=2026-11-27`,
      { repository: store.availabilityRepo, now: fixedNowTodayMorning }
    );
    assert.equal(inactiveAvail.is_bookable, false);

    // 4. BORROWED unit: unbookable today, STILL bookable tomorrow per Backend Spec §8.3
    store.projectors[0]!.is_active = true;
    store.projectors[0]!.physical_status = "BORROWED";
    const borrowedToday = await checkProjectorAvailability(
      `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_1_ID}&date=2026-11-26`,
      { repository: store.availabilityRepo, now: fixedNowTodayMorning }
    );
    assert.equal(borrowedToday.is_bookable, false);

    const borrowedTomorrow = await checkProjectorAvailability(
      `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_1_ID}&date=2026-11-27`,
      { repository: store.availabilityRepo, now: fixedNowTodayMorning }
    );
    assert.equal(borrowedTomorrow.is_bookable, true);

    // 5. Partial booking tomorrow (09:00-11:00 WIB) leaves free windows
    store.projectors[0]!.physical_status = "AVAILABLE";
    store.bookings.push({
      id: crypto.randomUUID(),
      booking_code: "BKG-20261127-010",
      projector_id: PROJECTOR_1_ID,
      booking_date: "2026-11-27",
      start_time: "09:00:00",
      start_at: "2026-11-27T02:00:00.000Z", // 09:00 WIB
      estimated_return_at: "2026-11-27T04:00:00.000Z", // 11:00 WIB
      status: "CONFIRMED",
    });
    const partialBooked = await checkProjectorAvailability(
      `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_1_ID}&date=2026-11-27`,
      { repository: store.availabilityRepo, now: fixedNowTodayMorning }
    );
    assert.equal(partialBooked.is_bookable, true);
    assert.equal(partialBooked.booked_slots.length, 1);
    assert.deepEqual(partialBooked.available_windows, [
      { start_time: "08:00:00", end_time: "09:00:00" },
      { start_time: "11:00:00", end_time: "17:00:00" },
    ]);

    // 6. Full coverage of operating hours leaves zero windows -> is_bookable = false
    store.bookings.push(
      {
        id: crypto.randomUUID(),
        booking_code: "BKG-20261127-011",
        projector_id: PROJECTOR_1_ID,
        booking_date: "2026-11-27",
        start_time: "08:00:00",
        start_at: "2026-11-27T01:00:00.000Z", // 08:00 WIB
        estimated_return_at: "2026-11-27T02:00:00.000Z", // 09:00 WIB
        status: "CONFIRMED",
      },
      {
        id: crypto.randomUUID(),
        booking_code: "BKG-20261127-012",
        projector_id: PROJECTOR_1_ID,
        booking_date: "2026-11-27",
        start_time: "11:00:00",
        start_at: "2026-11-27T04:00:00.000Z", // 11:00 WIB
        estimated_return_at: "2026-11-27T10:00:00.000Z", // 17:00 WIB
        status: "CONFIRMED",
      }
    );
    const fullBooked = await checkProjectorAvailability(
      `http://localhost:3000/api/v1/availability?projector_id=${PROJECTOR_1_ID}&date=2026-11-27`,
      { repository: store.availabilityRepo, now: fixedNowTodayMorning }
    );
    assert.equal(fullBooked.is_bookable, false);
    assert.equal(fullBooked.available_windows.length, 0);
  });
});

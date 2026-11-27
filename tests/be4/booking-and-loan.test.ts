import assert from "node:assert/strict";
import crypto from "node:crypto";
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

import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { OperatingHoursRepository } from "@/lib/operating-hours/operating-hours-service";
import {
  createBooking,
  cancelBooking,
  getKomtingBookingDetail,
  getBookingQrToken,
  listKomtingBookings,
  listStaffBookings,
  getStaffBookingDetail,
  type BookingRepository,
} from "@/lib/bookings/booking-service";
import {
  confirmPickup,
  listStaffLoans,
  getStaffLoanDetail,
  listKomtingLoans,
  type LoanRepository,
} from "@/lib/loans/loan-service";
import {
  computeRequestHash,
  withIdempotency,
  type IdempotencyStore,
} from "@/lib/idempotency/idempotency-service";
import { generateOpaqueQrPayload, hashQrPayload, validateScannedQr } from "@/lib/qr/qr-service";
import {
  computePickupWindow,
  getJakartaNowParts,
  isDateTimeInPastJakarta,
  isDateTodayOrTomorrowJakarta,
  jakartaDateTimeToUtc,
  normalizeTimeString,
} from "@/lib/utils/jakarta-time";
import type { BookingRow, Database, Json, ProjectorRow } from "@/lib/supabase/database.types";
import type { AccountStatus } from "@/types/domain";

type LoanRow = Database["public"]["Tables"]["loans"]["Row"];

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const KOMTING_1_ID = "33333333-3333-4333-8333-333333333333";
const KOMTING_2_ID = "44444444-4444-4444-8444-444444444444";
const PROJECTOR_1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECTOR_2_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeContext(
  role: "ADMIN" | "STAFF" | "KOMTING",
  userId?: string,
  overrides: { accountStatus?: string; assignmentStatus?: string } = {}
): AuthenticatedUserContext {
  const id = userId ?? (role === "ADMIN" ? ADMIN_ID : role === "STAFF" ? STAFF_ID : KOMTING_1_ID);
  const email = `${role.toLowerCase()}-${id.slice(0, 4)}@example.test`;
  const nowIso = "2026-11-26T00:00:00.000Z";
  const accStatus = overrides.accountStatus ?? "ACTIVE";
  const assignStatus = overrides.assignmentStatus ?? "ACTIVE";

  const komtingAssignment =
    role === "KOMTING" && assignStatus !== "NONE"
      ? {
          id: `asg-${id}`,
          user_id: id,
          class_name: "TI-3A",
          status: assignStatus,
          started_at: nowIso,
          ended_at: null,
        }
      : null;

  return {
    authUserId: `auth-${id}`,
    user: {
      id,
      email,
      full_name: `Test ${role}`,
      role,
      account_status: accStatus,
      komting_assignment: komtingAssignment,
    },
    rawUser: {
      id,
      auth_provider_user_id: `auth-${id}`,
      email,
      full_name: `Test ${role}`,
      role,
      account_status: accStatus as AccountStatus,
      created_at: nowIso,
      updated_at: nowIso,
    },
    komtingAssignment,
  };
}

function makeStatefulStore() {
  const bookings: BookingRow[] = [];
  const loans: LoanRow[] = [];
  const qrTokens: Array<{
    id: string;
    booking_id: string;
    token_hash: string;
    scope: string;
    expires_at: string;
    used_at: string | null;
    revoked_at: string | null;
    payload?: string;
  }> = [];

  const projectors: ProjectorRow[] = [
    {
      id: PROJECTOR_1_ID,
      asset_code: "PRJ-001",
      name: "Epson EB-X500",
      brand: "Epson",
      model: "EB-X500",
      physical_status: "AVAILABLE",
      is_active: true,
      created_at: "2026-11-26T00:00:00.000Z",
      updated_at: "2026-11-26T00:00:00.000Z",
    },
    {
      id: PROJECTOR_2_ID,
      asset_code: "PRJ-002",
      name: "BenQ MS550",
      brand: "BenQ",
      model: "MS550",
      physical_status: "AVAILABLE",
      is_active: true,
      created_at: "2026-11-26T00:00:00.000Z",
      updated_at: "2026-11-26T00:00:00.000Z",
    },
  ];

  const idempotencyMap = new Map<
    string,
    { requestHash: string; responseStatus: number; responseBody: unknown; expiresAt: number }
  >();

  const idempotencyStore: IdempotencyStore = {
    async getRecord({ actorUserId, route, idempotencyKey }) {
      const key = `${actorUserId ?? "anon"}:${route}:${idempotencyKey}`;
      const rec = idempotencyMap.get(key);
      if (!rec) return null;
      if (rec.expiresAt <= Date.now()) return null;
      return {
        requestHash: rec.requestHash,
        responseStatus: rec.responseStatus,
        responseBody: rec.responseBody,
      };
    },
    async saveRecord({
      actorUserId,
      route,
      idempotencyKey,
      requestHash,
      responseStatus,
      responseBody,
    }) {
      const key = `${actorUserId ?? "anon"}:${route}:${idempotencyKey}`;
      idempotencyMap.set(key, {
        requestHash,
        responseStatus,
        responseBody,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
    },
  };

  const bookingRepo: BookingRepository = {
    async createBookingAtomic(params) {
      // Check single active booking per komting
      const hasActive = bookings.some(
        (b) => b.komting_id === params.komtingUserId && b.status === "CONFIRMED"
      );
      if (hasActive) {
        throw new AuthError({
          status: 409,
          code: "ACTIVE_BOOKING_EXISTS",
          message: "Anda masih memiliki booking aktif.",
        });
      }

      // Check single active loan per komting
      const hasLoan = loans.some(
        (l) => l.komting_id === params.komtingUserId && l.status === "ACTIVE"
      );
      if (hasLoan) {
        throw new AuthError({
          status: 409,
          code: "ACTIVE_LOAN_EXISTS",
          message: "Anda masih memiliki peminjaman aktif yang belum dikembalikan.",
        });
      }

      // Check projector status
      const proj = projectors.find((p) => p.id === params.projectorId);
      if (!proj || !proj.is_active || proj.physical_status === "MAINTENANCE") {
        throw new AuthError({
          status: 409,
          code: "PROJECTOR_NOT_BOOKABLE",
          message: "Proyektor tidak tersedia untuk dibooking.",
        });
      }

      // Check overlapping bookings
      const startAtMs = new Date(
        jakartaDateTimeToUtc(params.bookingDate, params.startTime)
      ).getTime();
      const returnAtMs = new Date(params.estimatedReturnAt).getTime();
      const conflict = bookings.some((b) => {
        if (b.projector_id !== params.projectorId || b.status !== "CONFIRMED") return false;
        const bStartMs = new Date(b.start_at).getTime();
        const bEndMs = new Date(b.estimated_return_at).getTime();
        return startAtMs < bEndMs && returnAtMs > bStartMs;
      });

      if (conflict) {
        throw new AuthError({
          status: 409,
          code: "BOOKING_CONFLICT",
          message: "Jadwal booking bertabrakan dengan booking lain yang sudah terkonfirmasi.",
        });
      }

      const id = crypto.randomUUID();
      const code = `BKG-${params.bookingDate.replace(/-/g, "")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      const nowIso = new Date().toISOString();

      const newBooking: BookingRow = {
        id,
        booking_code: code,
        komting_id: params.komtingUserId,
        projector_id: params.projectorId,
        booking_date: params.bookingDate,
        start_time: params.startTime,
        start_at: jakartaDateTimeToUtc(params.bookingDate, params.startTime).toISOString(),
        estimated_return_at: params.estimatedReturnAt,
        status: "CONFIRMED",
        operating_hours_snapshot: params.operatingHoursSnapshot as unknown as Json,
        pickup_window_start_at: params.pickupWindowStartAt,
        pickup_window_end_at: params.pickupWindowEndAt,
        cancelled_at: null,
        cancelled_by: null,
        cancel_reason: null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      bookings.push(newBooking);

      if (params.qrTokenHash) {
        qrTokens.push({
          id: crypto.randomUUID(),
          booking_id: id,
          token_hash: params.qrTokenHash,
          scope: "PICKUP_AND_RETURN",
          expires_at: params.qrExpiresAt,
          used_at: null,
          revoked_at: null,
        });
      }

      return newBooking;
    },

    async cancelBookingAtomic(params) {
      const b = bookings.find((item) => item.id === params.bookingId);
      if (!b) {
        throw new AuthError({
          status: 404,
          code: "BOOKING_NOT_FOUND",
          message: "Booking tidak ditemukan.",
        });
      }
      if (b.komting_id !== params.komtingUserId) {
        throw new AuthError({
          status: 403,
          code: "FORBIDDEN",
          message: "Anda tidak memiliki akses ke booking ini.",
        });
      }
      if (b.status !== "CONFIRMED") {
        throw new AuthError({
          status: 409,
          code: "BOOKING_CANNOT_BE_CANCELLED",
          message: "Hanya booking dengan status CONFIRMED yang dapat dibatalkan.",
        });
      }
      b.status = "CANCELLED";
      b.cancelled_at = new Date().toISOString();
      b.cancelled_by = params.komtingUserId;
      b.cancel_reason = params.reason ?? "Dibatalkan oleh Komting.";
      b.updated_at = new Date().toISOString();

      for (const qt of qrTokens) {
        if (qt.booking_id === b.id && !qt.revoked_at) {
          qt.revoked_at = new Date().toISOString();
        }
      }

      return b;
    },

    async findBookingById(id) {
      return bookings.find((b) => b.id === id) ?? null;
    },

    async listKomtingBookings({ komtingUserId, status, page, pageSize }) {
      const filtered = bookings.filter(
        (b) => b.komting_id === komtingUserId && (!status || b.status === status)
      );
      const offset = (page - 1) * pageSize;
      return {
        items: filtered.slice(offset, offset + pageSize),
        totalItems: filtered.length,
      };
    },

    async listStaffBookings({ date, status, page, pageSize }) {
      const filtered = bookings.filter(
        (b) => (!date || b.booking_date === date) && (!status || b.status === status)
      );
      const offset = (page - 1) * pageSize;
      const items = filtered.slice(offset, offset + pageSize).map((b) => {
        const proj = projectors.find((p) => p.id === b.projector_id)!;
        return {
          id: b.id,
          booking_code: b.booking_code,
          komting_id: b.komting_id,
          projector_id: b.projector_id,
          booking_date: b.booking_date,
          start_time: b.start_time,
          start_at: b.start_at,
          estimated_return_at: b.estimated_return_at,
          status: b.status,
          operating_hours_snapshot: b.operating_hours_snapshot as unknown as Json,
          pickup_window: {
            opens_at: b.pickup_window_start_at,
            closes_at: b.pickup_window_end_at,
          },
          cancelled_at: b.cancelled_at,
          cancelled_by: b.cancelled_by,
          cancel_reason: b.cancel_reason,
          created_at: b.created_at,
          komting: {
            id: b.komting_id,
            full_name: "Komting User",
            email: "komting@example.test",
          },
          projector: {
            id: proj.id,
            asset_code: proj.asset_code,
            name: proj.name,
            brand: proj.brand,
            model: proj.model,
            physical_status: proj.physical_status,
          },
        };
      });
      return { items, totalItems: filtered.length };
    },

    async findStaffBookingDetail(id) {
      const b = bookings.find((item) => item.id === id);
      if (!b) return null;
      const proj = projectors.find((p) => p.id === b.projector_id)!;
      return {
        id: b.id,
        booking_code: b.booking_code,
        komting_id: b.komting_id,
        projector_id: b.projector_id,
        booking_date: b.booking_date,
        start_time: b.start_time,
        start_at: b.start_at,
        estimated_return_at: b.estimated_return_at,
        status: b.status,
        operating_hours_snapshot: b.operating_hours_snapshot as unknown as Json,
        pickup_window: {
          opens_at: b.pickup_window_start_at,
          closes_at: b.pickup_window_end_at,
        },
        cancelled_at: b.cancelled_at,
        cancelled_by: b.cancelled_by,
        cancel_reason: b.cancel_reason,
        created_at: b.created_at,
        komting: {
          id: b.komting_id,
          full_name: "Komting User",
          email: "komting@example.test",
          class_name: "TI-3A",
        },
        projector: {
          id: proj.id,
          asset_code: proj.asset_code,
          name: proj.name,
          brand: proj.brand,
          model: proj.model,
          physical_status: proj.physical_status,
        },
      };
    },
  };

  const loanRepo: LoanRepository = {
    async confirmPickupAtomic(params) {
      const b = bookings.find((item) => item.id === params.bookingId);
      if (!b) {
        throw new AuthError({
          status: 404,
          code: "BOOKING_NOT_FOUND",
          message: "Booking tidak ditemukan.",
        });
      }
      if (b.status === "FULFILLED") {
        throw new AuthError({
          status: 409,
          code: "BOOKING_ALREADY_FULFILLED",
          message: "Booking ini sudah selesai diambil.",
        });
      }
      if (b.status !== "CONFIRMED") {
        throw new AuthError({
          status: 409,
          code: "INVALID_REQUEST",
          message: "Hanya booking dengan status CONFIRMED yang dapat diambil.",
        });
      }

      const proj = projectors.find((p) => p.id === b.projector_id);
      if (!proj || proj.physical_status === "BORROWED") {
        throw new AuthError({
          status: 409,
          code: "PROJECTOR_NOT_AVAILABLE",
          message: "Proyektor sedang dipinjam atau tidak tersedia.",
        });
      }

      b.status = "FULFILLED";
      b.updated_at = new Date().toISOString();

      proj.physical_status = "BORROWED";
      proj.updated_at = new Date().toISOString();

      const loanId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const newLoan: LoanRow = {
        id: loanId,
        booking_id: b.id,
        projector_id: b.projector_id,
        komting_id: b.komting_id,
        status: "ACTIVE",
        picked_up_at: nowIso,
        pickup_processed_by: params.staffUserId,
        pickup_received_by: params.receivedBy,
        representative_name: params.representativeName ?? null,
        returned_at: null,
        return_processed_by: null,
        return_received_by: null,
        return_representative_name: null,
        lifecycle_seq: 1,
        created_at: nowIso,
        updated_at: nowIso,
      };
      loans.push(newLoan);

      return {
        booking: { id: b.id, status: b.status },
        loan: { id: newLoan.id, status: newLoan.status, picked_up_at: newLoan.picked_up_at },
        projector: { id: proj.id, physical_status: proj.physical_status },
      };
    },

    async findLoanById(loanId) {
      return loans.find((l) => l.id === loanId) ?? null;
    },

    async findStaffLoanDetail(loanId) {
      const l = loans.find((item) => item.id === loanId);
      if (!l) return null;
      const proj = projectors.find((p) => p.id === l.projector_id)!;
      const b = bookings.find((item) => item.id === l.booking_id);
      return {
        id: l.id,
        booking_id: l.booking_id,
        projector_id: l.projector_id,
        komting_id: l.komting_id,
        status: l.status,
        picked_up_at: l.picked_up_at,
        pickup_processed_by: l.pickup_processed_by,
        pickup_received_by: l.pickup_received_by,
        representative_name: l.representative_name,
        returned_at: l.returned_at,
        return_condition: null,
        return_processed_by: l.return_processed_by,
        return_received_by: l.return_received_by,
        return_representative_name: l.return_representative_name,
        created_at: l.created_at,
        updated_at: l.updated_at,
        booking_code: b?.booking_code,
        komting: {
          id: l.komting_id,
          full_name: "Komting User",
          email: "komting@example.test",
          class_name: "TI-3A",
        },
        projector: {
          id: proj.id,
          asset_code: proj.asset_code,
          name: proj.name,
          brand: proj.brand,
          model: proj.model,
          physical_status: proj.physical_status,
        },
      };
    },

    async listStaffLoans({ status, page, pageSize }) {
      const filtered = loans.filter((l) => !status || l.status === status);
      const offset = (page - 1) * pageSize;
      const items = filtered.slice(offset, offset + pageSize).map((l) => {
        const proj = projectors.find((p) => p.id === l.projector_id)!;
        const b = bookings.find((item) => item.id === l.booking_id);
        return {
          id: l.id,
          booking_id: l.booking_id,
          projector_id: l.projector_id,
          komting_id: l.komting_id,
          status: l.status,
          picked_up_at: l.picked_up_at,
          pickup_processed_by: l.pickup_processed_by,
          pickup_received_by: l.pickup_received_by,
          representative_name: l.representative_name,
          returned_at: l.returned_at,
          return_condition: null,
          return_processed_by: l.return_processed_by,
          return_received_by: l.return_received_by,
          return_representative_name: l.return_representative_name,
          created_at: l.created_at,
          updated_at: l.updated_at,
          booking_code: b?.booking_code,
          komting: {
            id: l.komting_id,
            full_name: "Komting User",
            email: "komting@example.test",
          },
          projector: {
            id: proj.id,
            asset_code: proj.asset_code,
            name: proj.name,
            brand: proj.brand,
            model: proj.model,
            physical_status: proj.physical_status,
          },
        };
      });
      return { items, totalItems: filtered.length };
    },

    async listKomtingLoans({ komtingUserId, status, page, pageSize }) {
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
          pickup_processed_by: l.pickup_processed_by,
          pickup_received_by: l.pickup_received_by,
          representative_name: l.representative_name,
          returned_at: l.returned_at,
          return_condition: null,
          return_processed_by: l.return_processed_by,
          return_received_by: l.return_received_by,
          return_representative_name: l.return_representative_name,
          created_at: l.created_at,
          updated_at: l.updated_at,
        })),
        totalItems: filtered.length,
      };
    },
  };

  const opHoursRepo: OperatingHoursRepository = {
    async getByServiceDate(date) {
      return {
        id: crypto.randomUUID(),
        service_date: date,
        timezone: "Asia/Jakarta",
        opens_at: "07:00:00",
        closes_at: "17:00:00",
        admin_early_open_at: "06:30:00",
        note: null,
        created_by: null,
        updated_by: null,
        created_at: "2026-11-26T00:00:00.000Z",
        updated_at: "2026-11-26T00:00:00.000Z",
      };
    },
    async upsertOperatingHoursAtomic() {
      throw new Error("not implemented");
    },
  };

  const qrRepo = {
    async findTokenByBookingId(bookingId: string) {
      const t = qrTokens.find((item) => item.booking_id === bookingId);
      if (!t) return null;
      return {
        id: t.id,
        booking_id: t.booking_id,
        loan_id: null,
        token_hash: t.token_hash,
        expires_at: t.expires_at,
        revoked_at: t.revoked_at,
        pickup_used_at: t.used_at,
      };
    },
    async createTokenForBooking({
      bookingId,
      tokenHash,
      expiresAt,
    }: {
      bookingId: string;
      tokenHash: string;
      expiresAt: string;
    }) {
      qrTokens.push({
        id: crypto.randomUUID(),
        booking_id: bookingId,
        token_hash: tokenHash,
        scope: "PICKUP_AND_RETURN",
        expires_at: expiresAt,
        used_at: null,
        revoked_at: null,
      });
    },
    async updateTokenForBooking({
      bookingId,
      tokenHash,
      expiresAt,
    }: {
      bookingId: string;
      tokenHash: string;
      expiresAt: string;
    }) {
      const t = qrTokens.find((item) => item.booking_id === bookingId);
      if (t) {
        t.token_hash = tokenHash;
        t.expires_at = expiresAt;
      }
    },
    async findTokenWithDetailsByHash() {
      return null;
    },
  };

  return {
    bookings,
    loans,
    projectors,
    qrTokens,
    idempotencyStore,
    bookingRepo,
    loanRepo,
    opHoursRepo,
    qrRepo,
  };
}

describe("Sprint BE-4: Booking & Loan Management Unit & Integration Tests", () => {
  describe("1. Jakarta Time & Window Utilities", () => {
    it("verifies isDateTodayOrTomorrowJakarta for today, tomorrow, and past/future", () => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);

      assert.strictEqual(isDateTodayOrTomorrowJakarta(parts), true);
      assert.strictEqual(isDateTodayOrTomorrowJakarta("2020-01-01"), false);
      assert.strictEqual(isDateTodayOrTomorrowJakarta("2099-12-31"), false);
    });

    it("verifies isDateTimeInPastJakarta for past and future times", () => {
      assert.strictEqual(isDateTimeInPastJakarta("2020-01-01", "10:00:00"), true);
      assert.strictEqual(isDateTimeInPastJakarta("2099-01-01", "10:00:00"), false);
    });

    it("computes pickup window tolerance correctly (30 min before, 15 min after)", () => {
      const window = computePickupWindow("2026-11-26", "10:00:00", {
        early_pickup_allowed_at: "06:30:00",
      });
      const opensMs = new Date(window.opens_at).getTime();
      const closesMs = new Date(window.closes_at).getTime();
      assert.strictEqual(closesMs - opensMs, 45 * 60 * 1000); // 45 minutes total tolerance
    });

    it("translates Jakarta date and time to ISO UTC string", () => {
      const utc = jakartaDateTimeToUtc("2026-11-26", "08:00:00").toISOString();
      assert.strictEqual(utc, "2026-11-26T01:00:00.000Z");
    });

    it("normalizes time string to HH:MM:SS", () => {
      assert.strictEqual(normalizeTimeString("8:30"), "08:30:00");
      assert.strictEqual(normalizeTimeString("08:30:00"), "08:30:00");
    });
  });

  describe("2. Idempotency Service", () => {
    it("computes consistent sha256 request hash", () => {
      const h1 = computeRequestHash({ a: 1, b: "test" });
      const h2 = computeRequestHash({ a: 1, b: "test" });
      const h3 = computeRequestHash({ a: 2, b: "test" });
      assert.strictEqual(h1, h2);
      assert.notStrictEqual(h1, h3);
    });

    it("replays cached response for identical idempotency key and payload", async () => {
      const store = makeStatefulStore().idempotencyStore;
      let executions = 0;

      const run = () =>
        withIdempotency({
          actorUserId: KOMTING_1_ID,
          route: "POST /api/v1/bookings",
          idempotencyKey: "idem-key-1",
          requestBody: { projector_id: PROJECTOR_1_ID },
          store,
          execute: async () => {
            executions++;
            return {
              status: 201,
              body: { data: { booking_id: "bkg-1" } },
            };
          },
        });

      const first = await run();
      assert.strictEqual(first.status, 201);
      assert.strictEqual(executions, 1);

      const second = await run();
      assert.strictEqual(second.status, 201);
      assert.strictEqual(executions, 1); // Cached replay, not re-executed
    });

    it("rejects mismatched payload with 409 IDEMPOTENCY_KEY_REUSED", async () => {
      const store = makeStatefulStore().idempotencyStore;

      await withIdempotency({
        actorUserId: KOMTING_1_ID,
        route: "POST /api/v1/bookings",
        idempotencyKey: "idem-key-2",
        requestBody: { projector_id: PROJECTOR_1_ID },
        store,
        execute: async () => ({
          status: 201,
          body: { data: { ok: true } },
        }),
      });

      await assert.rejects(
        () =>
          withIdempotency({
            actorUserId: KOMTING_1_ID,
            route: "POST /api/v1/bookings",
            idempotencyKey: "idem-key-2",
            requestBody: { projector_id: PROJECTOR_2_ID }, // Changed payload
            store,
            execute: async () => ({
              status: 201,
              body: { data: { ok: true } },
            }),
          }),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 409);
          assert.strictEqual(err.code, "IDEMPOTENCY_KEY_REUSED");
          return true;
        }
      );
    });
  });

  describe("3. QR Token Generation & Scanning", () => {
    it("generates opaque QR payload starting with pjmqr_v1_", () => {
      const payload = generateOpaqueQrPayload();
      assert(payload.startsWith("pjmqr_v1_"));
      assert(payload.length > 30);
    });

    it("hashes QR payload with sha256 hex string", () => {
      const p = "pjmqr_v1_sample_payload";
      const h = hashQrPayload(p);
      assert.strictEqual(h.length, 64);
      assert.strictEqual(h, crypto.createHash("sha256").update(p).digest("hex"));
    });

    it("validates QR scanning correctly for PICKUP", async () => {
      const fakeRepo = {
        async findTokenByBookingId() {
          return null;
        },
        async createTokenForBooking() {},
        async findTokenWithDetailsByHash(tokenHash: string) {
          return {
            id: "qt-1",
            booking_id: "bkg-1",
            loan_id: null,
            token_hash: tokenHash,
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            pickup_used_at: null,
            return_used_at: null,
            revoked_at: null,
            booking: {
              id: "bkg-1",
              booking_code: "BKG-20261126-A1B2",
              status: "CONFIRMED",
              komting_id: KOMTING_1_ID,
              projector_id: PROJECTOR_1_ID,
              pickup_window_start_at: new Date(Date.now() - 60000).toISOString(),
              pickup_window_end_at: new Date(Date.now() + 3600000).toISOString(),
            },
            projector: {
              id: PROJECTOR_1_ID,
              name: "Epson EB-X500",
              physical_status: "AVAILABLE",
            },
            komting: {
              id: KOMTING_1_ID,
              full_name: "Keegan Komting",
            },
            className: "TI-3A",
          };
        },
      };

      const res = await validateScannedQr(
        {
          qrPayload: "pjmqr_v1_valid_payload",
          action: "PICKUP",
          requestId: "req_test",
        },
        { repository: fakeRepo }
      );

      assert.strictEqual(res.action, "PICKUP");
      assert.strictEqual(res.transaction.booking_id, "bkg-1");
      assert.strictEqual(res.transaction.komting_name, "Keegan Komting");
      assert.strictEqual(res.transaction.class_name, "TI-3A");
    });

    it("rejects RETURN action when scanning PICKUP QR with no active loan", async () => {
      const fakeRepo = {
        async findTokenByBookingId() {
          return null;
        },
        async createTokenForBooking() {},
        async findTokenWithDetailsByHash(tokenHash: string) {
          return {
            id: "qt-1",
            booking_id: "bkg-1",
            loan_id: null,
            token_hash: tokenHash,
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            pickup_used_at: null,
            return_used_at: null,
            revoked_at: null,
            booking: {
              id: "bkg-1",
              booking_code: "BKG-20261126-A1B2",
              status: "CONFIRMED",
              komting_id: KOMTING_1_ID,
              projector_id: PROJECTOR_1_ID,
              pickup_window_start_at: new Date().toISOString(),
              pickup_window_end_at: new Date().toISOString(),
            },
            projector: {
              id: PROJECTOR_1_ID,
              name: "Epson EB-X500",
              physical_status: "AVAILABLE",
            },
            komting: {
              id: KOMTING_1_ID,
              full_name: "Keegan Komting",
            },
            className: "TI-3A",
          };
        },
      };

      await assert.rejects(
        () =>
          validateScannedQr(
            {
              qrPayload: "pjmqr_v1_valid_payload",
              action: "RETURN",
              requestId: "req_test",
            },
            { repository: fakeRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 409);
          assert.strictEqual(err.code, "QR_ACTION_MISMATCH");
          return true;
        }
      );
    });
  });

  describe("4. Booking Service Workflows & Business Rules", () => {
    it("creates a CONFIRMED booking with pickup window and generated QR code", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);

      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000)); // Tomorrow

      const result = await createBooking(
        komtingCtx,
        {
          projector_id: PROJECTOR_1_ID,
          booking_date: targetDate,
          start_time: "09:00:00",
          estimated_return_at: jakartaDateTimeToUtc(targetDate, "12:00:00"),
        },
        "idem-create-1",
        "req_bkg_1",
        {
          repository: state.bookingRepo,
          operatingHoursRepository: state.opHoursRepo,
          idempotencyStore: state.idempotencyStore,
        }
      );

      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.body.data.status, "CONFIRMED");
      assert(result.body.data.booking_code.startsWith(`BKG-${targetDate.replace(/-/g, "")}-`));
      assert(result.body.data.pickup_window.opens_at);
      assert(result.body.data.pickup_window.closes_at);
      assert(result.body.data.qr_payload);
      assert.strictEqual(state.bookings.length, 1);
    });

    it("rejects booking when date is in the past", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);

      await assert.rejects(
        () =>
          createBooking(
            komtingCtx,
            {
              projector_id: PROJECTOR_1_ID,
              booking_date: "2025-01-01",
              start_time: "09:00:00",
              estimated_return_at: "2025-01-01T05:00:00.000Z",
            },
            null,
            "req_past_date",
            { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 422);
          assert.strictEqual(err.code, "BOOKING_DATE_INVALID");
          return true;
        }
      );
    });

    it("rejects booking when start time is in the past for today (Asia/Jakarta)", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);

      const { today } = getJakartaNowParts();

      await assert.rejects(
        () =>
          createBooking(
            komtingCtx,
            {
              projector_id: PROJECTOR_1_ID,
              booking_date: today,
              start_time: "00:01:00",
              estimated_return_at: jakartaDateTimeToUtc(today, "02:00:00").toISOString(),
            },
            null,
            "req_past_start_time",
            { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 422);
          assert.strictEqual(err.code, "BOOKING_TIME_IN_PAST");
          assert.strictEqual(err.message, "Waktu booking sudah terlewat.");
          return true;
        }
      );
    });

    it("rejects booking when estimated return is before start time", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);

      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      await assert.rejects(
        () =>
          createBooking(
            komtingCtx,
            {
              projector_id: PROJECTOR_1_ID,
              booking_date: targetDate,
              start_time: "10:00:00",
              estimated_return_at: jakartaDateTimeToUtc(targetDate, "09:00:00"),
            },
            null,
            "req_invalid_return",
            { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 422);
          assert.strictEqual(err.code, "BOOKING_TIME_INVALID");
          return true;
        }
      );
    });

    it("rejects booking when komting does not have ACTIVE assignment", async () => {
      const state = makeStatefulStore();
      const komtingNoAssignCtx = makeContext("KOMTING", KOMTING_1_ID, { assignmentStatus: "NONE" });

      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      await assert.rejects(
        () =>
          createBooking(
            komtingNoAssignCtx,
            {
              projector_id: PROJECTOR_1_ID,
              booking_date: targetDate,
              start_time: "09:00:00",
              estimated_return_at: jakartaDateTimeToUtc(targetDate, "12:00:00"),
            },
            null,
            "req_no_assign",
            { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 403);
          assert.strictEqual(err.code, "KOMTING_ASSIGNMENT_REQUIRED");
          return true;
        }
      );
    });

    it("rejects booking when komting already has an active CONFIRMED booking", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);

      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      // First booking succeeds
      await createBooking(
        komtingCtx,
        {
          projector_id: PROJECTOR_1_ID,
          booking_date: targetDate,
          start_time: "08:00:00",
          estimated_return_at: jakartaDateTimeToUtc(targetDate, "10:00:00"),
        },
        null,
        "req_bkg_first",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );

      // Second booking on different projector is rejected
      await assert.rejects(
        () =>
          createBooking(
            komtingCtx,
            {
              projector_id: PROJECTOR_2_ID,
              booking_date: targetDate,
              start_time: "13:00:00",
              estimated_return_at: jakartaDateTimeToUtc(targetDate, "15:00:00"),
            },
            null,
            "req_bkg_second",
            { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 409);
          assert.strictEqual(err.code, "ACTIVE_BOOKING_EXISTS");
          return true;
        }
      );
    });

    it("rejects booking when overlapping with another confirmed booking on same projector", async () => {
      const state = makeStatefulStore();
      const komting1Ctx = makeContext("KOMTING", KOMTING_1_ID);
      const komting2Ctx = makeContext("KOMTING", KOMTING_2_ID);

      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      // Komting 1 books 09:00 - 12:00
      await createBooking(
        komting1Ctx,
        {
          projector_id: PROJECTOR_1_ID,
          booking_date: targetDate,
          start_time: "09:00:00",
          estimated_return_at: jakartaDateTimeToUtc(targetDate, "12:00:00"),
        },
        null,
        "req_bkg_k1",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );

      // Komting 2 attempts booking overlapping 11:00 - 14:00 on same projector
      await assert.rejects(
        () =>
          createBooking(
            komting2Ctx,
            {
              projector_id: PROJECTOR_1_ID,
              booking_date: targetDate,
              start_time: "11:00:00",
              estimated_return_at: jakartaDateTimeToUtc(targetDate, "14:00:00"),
            },
            null,
            "req_bkg_k2_overlap",
            { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 409);
          assert.strictEqual(err.code, "BOOKING_CONFLICT");
          return true;
        }
      );
    });

    it("cancels a CONFIRMED booking and revokes QR token", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);

      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      const created = await createBooking(
        komtingCtx,
        {
          projector_id: PROJECTOR_1_ID,
          booking_date: targetDate,
          start_time: "09:00:00",
          estimated_return_at: jakartaDateTimeToUtc(targetDate, "12:00:00"),
        },
        null,
        "req_bkg_tocancel",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );

      const cancelled = await cancelBooking(
        komtingCtx,
        created.body.data.id,
        { reason: "Dosen berhalangan hadir." },
        "req_cancel_1",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );

      assert.strictEqual(cancelled.status, "CANCELLED");
      assert.strictEqual(state.bookings[0]?.status, "CANCELLED");
      assert.strictEqual(state.bookings[0]?.cancel_reason, "Dosen berhalangan hadir.");

      // Verify that cancelling already cancelled booking fails
      await assert.rejects(
        () =>
          cancelBooking(
            komtingCtx,
            created.body.data.id,
            { reason: "Batal lagi." },
            "req_cancel_again",
            { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 409);
          assert.strictEqual(err.code, "BOOKING_CANNOT_BE_CANCELLED");
          return true;
        }
      );
    });

    it("fetches komting booking detail, qr payload, and list", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);
      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      const created = await createBooking(
        komtingCtx,
        {
          projector_id: PROJECTOR_1_ID,
          booking_date: targetDate,
          start_time: "09:00:00",
          estimated_return_at: jakartaDateTimeToUtc(targetDate, "12:00:00"),
        },
        null,
        "req_bkg_detail",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );

      const detail = await getKomtingBookingDetail(komtingCtx, created.body.data.id, {
        repository: state.bookingRepo,
        operatingHoursRepository: state.opHoursRepo,
      });
      assert.strictEqual(detail.id, created.body.data.id);
      assert.strictEqual(detail.status, "CONFIRMED");

      const qr = await getBookingQrToken(komtingCtx, created.body.data.id, {
        repository: state.bookingRepo,
        qrRepository: state.qrRepo,
        operatingHoursRepository: state.opHoursRepo,
      });
      assert(qr.qr_payload);
      assert(qr.expires_at);

      const list = await listKomtingBookings(
        komtingCtx,
        "http://localhost/api/v1/komting/bookings?page=1&page_size=10",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );
      assert.strictEqual(list.items.length, 1);
      assert.strictEqual(list.pagination.total_items, 1);
    });

    it("allows staff and admin to view booking list and detail", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);
      const staffCtx = makeContext("STAFF", STAFF_ID);
      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      const created = await createBooking(
        komtingCtx,
        {
          projector_id: PROJECTOR_1_ID,
          booking_date: targetDate,
          start_time: "09:00:00",
          estimated_return_at: jakartaDateTimeToUtc(targetDate, "12:00:00"),
        },
        null,
        "req_bkg_staff_view",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );

      const list = await listStaffBookings(
        staffCtx,
        `http://localhost/api/v1/staff/bookings?date=${targetDate}`,
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );
      assert.strictEqual(list.items.length, 1);
      assert.strictEqual(list.items[0]?.komting.email, "komting@example.test");
      assert.strictEqual(list.items[0]?.projector.asset_code, "PRJ-001");

      const detail = await getStaffBookingDetail(staffCtx, created.body.data.id, {
        repository: state.bookingRepo,
        operatingHoursRepository: state.opHoursRepo,
      });
      assert.strictEqual(detail.id, created.body.data.id);
      assert.strictEqual(detail.komting.class_name, "TI-3A");
    });
  });

  describe("5. Loan Service & Pickup Confirmation Workflows", () => {
    it("confirms pickup: booking transitions to FULFILLED, projector to BORROWED, and ACTIVE loan created", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);
      const staffCtx = makeContext("STAFF", STAFF_ID);
      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      const bkg = await createBooking(
        komtingCtx,
        {
          projector_id: PROJECTOR_1_ID,
          booking_date: targetDate,
          start_time: "09:00:00",
          estimated_return_at: jakartaDateTimeToUtc(targetDate, "12:00:00"),
        },
        null,
        "req_bkg_pickup",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );

      const pickupRes = await confirmPickup(
        staffCtx,
        bkg.body.data.id,
        {
          qr_payload: bkg.body.data.qr_payload!,
          received_by: "KOMTING",
          confirmed: true,
        },
        "idem-pickup-1",
        "req_pickup_1",
        { repository: state.loanRepo, idempotencyStore: state.idempotencyStore }
      );

      assert.strictEqual(pickupRes.status, 200);
      assert.strictEqual(pickupRes.body.data.booking.status, "FULFILLED");
      assert.strictEqual(pickupRes.body.data.loan.status, "ACTIVE");
      assert.strictEqual(pickupRes.body.data.projector.physical_status, "BORROWED");

      // Verify projector is now BORROWED
      assert.strictEqual(state.projectors[0]?.physical_status, "BORROWED");
      assert.strictEqual(state.loans.length, 1);
      assert.strictEqual(state.loans[0]?.status, "ACTIVE");

      // Attempting double pickup rejected
      await assert.rejects(
        () =>
          confirmPickup(
            staffCtx,
            bkg.body.data.id,
            {
              qr_payload: bkg.body.data.qr_payload!,
              received_by: "KOMTING",
              confirmed: true,
            },
            null,
            "req_pickup_double",
            { repository: state.loanRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 409);
          assert.strictEqual(err.code, "BOOKING_ALREADY_FULFILLED");
          return true;
        }
      );
    });

    it("requires representative name when pickup is done by REPRESENTATIVE", async () => {
      const state = makeStatefulStore();
      const staffCtx = makeContext("STAFF", STAFF_ID);

      await assert.rejects(
        () =>
          confirmPickup(
            staffCtx,
            crypto.randomUUID(),
            {
              qr_payload: "pjmqr_v1_dummy",
              received_by: "REPRESENTATIVE",
              confirmed: true,
              // representative_name missing
            },
            null,
            "req_rep_missing",
            { repository: state.loanRepo }
          ),
        (err: unknown) => {
          assert(err instanceof AuthError);
          assert.strictEqual(err.status, 422);
          assert.strictEqual(err.code, "INVALID_REQUEST");
          return true;
        }
      );
    });

    it("allows staff to list loans and get loan details", async () => {
      const state = makeStatefulStore();
      const komtingCtx = makeContext("KOMTING", KOMTING_1_ID);
      const staffCtx = makeContext("STAFF", STAFF_ID);
      const targetDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

      const bkg = await createBooking(
        komtingCtx,
        {
          projector_id: PROJECTOR_1_ID,
          booking_date: targetDate,
          start_time: "09:00:00",
          estimated_return_at: jakartaDateTimeToUtc(targetDate, "12:00:00"),
        },
        null,
        "req_bkg_loan_view",
        { repository: state.bookingRepo, operatingHoursRepository: state.opHoursRepo }
      );

      const pickupRes = await confirmPickup(
        staffCtx,
        bkg.body.data.id,
        {
          qr_payload: bkg.body.data.qr_payload!,
          received_by: "REPRESENTATIVE",
          representative_name: "Budi Santoso",
          confirmed: true,
        },
        null,
        "req_pickup_rep",
        { repository: state.loanRepo }
      );

      const staffLoans = await listStaffLoans(
        staffCtx,
        "http://localhost/api/v1/staff/loans?status=ACTIVE",
        { repository: state.loanRepo }
      );
      assert.strictEqual(staffLoans.items.length, 1);
      assert.strictEqual(staffLoans.items[0]?.representative_name, "Budi Santoso");

      const loanDetail = await getStaffLoanDetail(staffCtx, pickupRes.body.data.loan.id, {
        repository: state.loanRepo,
      });
      assert.strictEqual(loanDetail.id, pickupRes.body.data.loan.id);
      assert.strictEqual(loanDetail.komting.class_name, "TI-3A");
      assert.strictEqual(loanDetail.projector.asset_code, "PRJ-001");

      const komtingLoans = await listKomtingLoans(
        komtingCtx,
        "http://localhost/api/v1/komting/loans",
        { repository: state.loanRepo }
      );
      assert.strictEqual(komtingLoans.items.length, 1);
      assert.strictEqual(komtingLoans.items[0]?.id, pickupRes.body.data.loan.id);
    });
  });
});

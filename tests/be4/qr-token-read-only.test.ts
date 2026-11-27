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
if (!process.env.QR_TOKEN_SECRET) {
  process.env.QR_TOKEN_SECRET = "test-qr-hmac-secret-key-32bytes-long";
}

import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  getBookingQrToken,
  type BookingRepository,
} from "@/lib/bookings/booking-service";
import {
  generateDeterministicQrPayload,
  hashQrPayload,
  type QrTokenRepository,
} from "@/lib/qr/qr-service";
import type { BookingRow } from "@/lib/supabase/database.types";

function makeKomtingContext(userId: string): AuthenticatedUserContext {
  const nowIso = "2026-11-26T00:00:00.000Z";
  const komtingAssignment = {
    id: `asg-${userId}`,
    class_name: "TI-3A",
    status: "ACTIVE" as const,
  };

  return {
    authUserId: `auth-${userId}`,
    user: {
      id: userId,
      email: `${userId}@kampus.ac.id`,
      full_name: `Komting ${userId}`,
      role: "KOMTING",
      account_status: "ACTIVE",
      komting_assignment: komtingAssignment,
    },
    rawUser: {
      id: userId,
      auth_provider_user_id: `auth-${userId}`,
      email: `${userId}@kampus.ac.id`,
      full_name: `Komting ${userId}`,
      role: "KOMTING",
      account_status: "ACTIVE",
      created_at: nowIso,
      updated_at: nowIso,
    },
    komtingAssignment,
  };
}

describe("DEF-003: QR Token Read-Only Retrieval Regression Tests", () => {
  const KOMTING_OWNER = "u_komting_owner";
  const KOMTING_OTHER = "u_komting_other";
  const BOOKING_ID = "00000000-0000-4000-8000-000000000001";
  const PROJECTOR_ID = "11111111-1111-4111-8111-111111111111";

  function createMockStore(params?: {
    customTokenHash?: string;
    cachedPayload?: string;
    revokedAt?: string | null;
    expiresAt?: string;
    status?: string;
  }) {
    let updateCallCount = 0;
    let createCallCount = 0;

    const deterministicPayload = generateDeterministicQrPayload({
      komtingId: KOMTING_OWNER,
      projectorId: PROJECTOR_ID,
      bookingDate: "2026-11-28",
      startTime: "09:00:00",
      estimatedReturnAt: "2026-11-28T04:00:00.000Z",
    });

    const activeTokenHash = params?.customTokenHash ?? hashQrPayload(deterministicPayload);

    const bookingRow: BookingRow = {
      id: BOOKING_ID,
      booking_code: "BKG-20261128-0001",
      komting_id: KOMTING_OWNER,
      projector_id: PROJECTOR_ID,
      booking_date: "2026-11-28",
      start_time: "09:00:00",
      start_at: "2026-11-28T02:00:00.000Z",
      estimated_return_at: "2026-11-28T04:00:00.000Z",
      status: (params?.status ?? "CONFIRMED") as "CONFIRMED" | "FULFILLED" | "CANCELLED" | "EXPIRED",
      operating_hours_snapshot: {},
      pickup_window_start_at: "2026-11-28T01:30:00.000Z",
      pickup_window_end_at: params?.expiresAt ?? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null,
      created_at: "2026-11-27T09:00:00.000Z",
      updated_at: "2026-11-27T09:00:00.000Z",
    };

    const bookingRepo: BookingRepository = {
      async findBookingById(id: string) {
        return id === BOOKING_ID ? bookingRow : null;
      },
      async findStaffBookingDetail() {
        return null;
      },
      async createBookingAtomic() {
        throw new Error("createBookingAtomic should not be called in read-only GET");
      },
      async cancelBookingAtomic() {
        throw new Error("cancelBookingAtomic should not be called in read-only GET");
      },
      async listKomtingBookings() {
        return { items: [], totalItems: 0 };
      },
      async listStaffBookings() {
        return { items: [], totalItems: 0 };
      },
    };

    const qrRepo: QrTokenRepository = {
      async findTokenByBookingId(bkgId: string) {
        if (bkgId !== BOOKING_ID) return null;
        return {
          id: "qr_row_1",
          token_hash: activeTokenHash,
          expires_at: bookingRow.pickup_window_end_at,
          revoked_at: params?.revokedAt ?? null,
          pickup_used_at: null,
        };
      },
      async findCachedPayloadByBookingId(bkgId: string) {
        if (bkgId === BOOKING_ID && params?.cachedPayload) {
          return params.cachedPayload;
        }
        return null;
      },
      async createTokenForBooking() {
        createCallCount++;
        throw new Error("MUTATION_VIOLATION: createTokenForBooking must not be called during GET");
      },
      async updateTokenForBooking() {
        updateCallCount++;
        throw new Error("MUTATION_VIOLATION: updateTokenForBooking must not be called during GET");
      },
      async findTokenWithDetailsByHash() {
        return null;
      },
    };

    return {
      bookingRepo,
      qrRepo,
      getUpdateCallCount: () => updateCallCount,
      getCreateCallCount: () => createCallCount,
      deterministicPayload,
      activeTokenHash,
    };
  }

  it("1. GET QR booking yang valid berhasil", async () => {
    const store = createMockStore();
    const ctx = makeKomtingContext(KOMTING_OWNER);

    const result = await getBookingQrToken(ctx, BOOKING_ID, {
      repository: store.bookingRepo,
      qrRepository: store.qrRepo,
    });

    assert(result.qr_payload);
    assert.strictEqual(result.qr_payload, store.deterministicPayload);
    assert(result.expires_at);
  });

  it("2. GET QR berulang menghasilkan payload yang sama (stabil dan idempotent)", async () => {
    const store = createMockStore();
    const ctx = makeKomtingContext(KOMTING_OWNER);

    const first = await getBookingQrToken(ctx, BOOKING_ID, {
      repository: store.bookingRepo,
      qrRepository: store.qrRepo,
    });

    const second = await getBookingQrToken(ctx, BOOKING_ID, {
      repository: store.bookingRepo,
      qrRepository: store.qrRepo,
    });

    assert.strictEqual(first.qr_payload, second.qr_payload);
    assert.strictEqual(first.expires_at, second.expires_at);
  });

  it("3. GET QR tidak menjalankan operasi mutasi database (no update/insert/delete)", async () => {
    const store = createMockStore();
    const ctx = makeKomtingContext(KOMTING_OWNER);

    await getBookingQrToken(ctx, BOOKING_ID, {
      repository: store.bookingRepo,
      qrRepository: store.qrRepo,
    });

    assert.strictEqual(store.getUpdateCallCount(), 0, "updateTokenForBooking must NEVER be called");
    assert.strictEqual(store.getCreateCallCount(), 0, "createTokenForBooking must NEVER be called");
  });

  it("4. Booking lama BKG-20261128-3465 dapat menampilkan QR dari cached idempotency", async () => {
    const originalPayload = "pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM";
    const originalHash = hashQrPayload(originalPayload);

    const store = createMockStore({
      customTokenHash: originalHash,
      cachedPayload: originalPayload,
    });
    const ctx = makeKomtingContext(KOMTING_OWNER);

    const result = await getBookingQrToken(ctx, BOOKING_ID, {
      repository: store.bookingRepo,
      qrRepository: store.qrRepo,
    });

    assert.strictEqual(result.qr_payload, originalPayload);
    assert.strictEqual(store.getUpdateCallCount(), 0);
  });

  it("5. Hash payload sesuai dengan token_hash", async () => {
    const store = createMockStore();
    const ctx = makeKomtingContext(KOMTING_OWNER);

    const result = await getBookingQrToken(ctx, BOOKING_ID, {
      repository: store.bookingRepo,
      qrRepository: store.qrRepo,
    });

    const computedHash = hashQrPayload(result.qr_payload);
    assert.strictEqual(computedHash, store.activeTokenHash);
  });

  it("6. KOMTING lain tidak dapat membaca QR (403 FORBIDDEN)", async () => {
    const store = createMockStore();
    const ctxOther = makeKomtingContext(KOMTING_OTHER);

    await assert.rejects(
      () =>
        getBookingQrToken(ctxOther, BOOKING_ID, {
          repository: store.bookingRepo,
          qrRepository: store.qrRepo,
        }),
      (err: unknown) => {
        assert(err instanceof AuthError);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("7. Pengguna non-KOMTING ditolak dengan 403 FORBIDDEN", async () => {
    const store = createMockStore();
    const staffCtx: AuthenticatedUserContext = {
      authUserId: "auth-staff_1",
      user: {
        id: "staff_1",
        email: "staff@kampus.ac.id",
        full_name: "Staff Petugas",
        role: "STAFF",
        account_status: "ACTIVE",
      },
      rawUser: {
        id: "staff_1",
        auth_provider_user_id: "auth-staff_1",
        email: "staff@kampus.ac.id",
        full_name: "Staff Petugas",
        role: "STAFF",
        account_status: "ACTIVE",
        created_at: "2026-11-26T00:00:00.000Z",
        updated_at: "2026-11-26T00:00:00.000Z",
      },
      komtingAssignment: null,
    };

    await assert.rejects(
      () =>
        getBookingQrToken(staffCtx, BOOKING_ID, {
          repository: store.bookingRepo,
          qrRepository: store.qrRepo,
        }),
      (err: unknown) => {
        assert(err instanceof AuthError);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("8. Token kedaluwarsa atau dicabut ditangani dengan 422 QR_EXPIRED", async () => {
    // 8a: Token revoked
    const revokedStore = createMockStore({
      revokedAt: new Date(Date.now() - 3600000).toISOString(),
    });
    const ctx = makeKomtingContext(KOMTING_OWNER);

    await assert.rejects(
      () =>
        getBookingQrToken(ctx, BOOKING_ID, {
          repository: revokedStore.bookingRepo,
          qrRepository: revokedStore.qrRepo,
        }),
      (err: unknown) => {
        assert(err instanceof AuthError);
        assert.strictEqual(err.status, 422);
        assert.strictEqual(err.code, "QR_EXPIRED");
        assert.match(err.message, /dicabut/i);
        return true;
      }
    );

    // 8b: Token expired
    const expiredStore = createMockStore({
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
    });

    await assert.rejects(
      () =>
        getBookingQrToken(ctx, BOOKING_ID, {
          repository: expiredStore.bookingRepo,
          qrRepository: expiredStore.qrRepo,
        }),
      (err: unknown) => {
        assert(err instanceof AuthError);
        assert.strictEqual(err.status, 422);
        assert.strictEqual(err.code, "QR_EXPIRED");
        assert.match(err.message, /kedaluwarsa/i);
        return true;
      }
    );
  });
});

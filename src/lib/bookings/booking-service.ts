import crypto from "node:crypto";
import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { withIdempotency, type IdempotencyStore } from "@/lib/idempotency/idempotency-service";
import {
  getOperatingHoursForDate,
  type OperatingHoursRepository,
} from "@/lib/operating-hours/operating-hours-service";
import {
  createSupabaseQrRepository,
  generateDeterministicQrPayload,
  hashQrPayload,
  type QrTokenRepository,
} from "@/lib/qr/qr-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  computePickupWindow,
  isDateTimeInPastJakarta,
  isDateTodayOrTomorrowJakarta,
  jakartaDateTimeToUtc,
  normalizeTimeString,
  timeToSeconds,
  toJakartaLocalParts,
} from "@/lib/utils/jakarta-time";
import type { Booking, BookingStatus, PaginationMeta } from "@/types/domain";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export interface BookingCreationResult {
  id: string;
  booking_code: string;
  status: BookingStatus;
  projector_id: string;
  booking_date: string;
  start_time: string;
  estimated_return_at: string;
  pickup_window: {
    opens_at: string;
    closes_at: string;
  };
  created_at: string;
  qr_payload?: string;
}

export interface StaffBookingView extends Booking {
  komting: {
    id: string;
    full_name: string;
    email: string;
    class_name?: string;
  };
  projector: {
    id: string;
    asset_code: string;
    name: string;
    brand: string | null;
    model: string | null;
    physical_status: string;
  };
}

export interface BookingRepository {
  createBookingAtomic(params: {
    komtingUserId: string;
    projectorId: string;
    bookingDate: string;
    startTime: string;
    estimatedReturnAt: string;
    operatingHoursSnapshot: Record<string, unknown>;
    pickupWindowStartAt: string;
    pickupWindowEndAt: string;
    qrTokenHash: string;
    qrExpiresAt: string;
    requestId: string;
  }): Promise<BookingRow>;

  cancelBookingAtomic(params: {
    bookingId: string;
    komtingUserId: string;
    reason: string;
    requestId: string;
  }): Promise<BookingRow>;

  findBookingById(bookingId: string): Promise<BookingRow | null>;

  listKomtingBookings(params: {
    komtingUserId: string;
    status?: BookingStatus;
    page: number;
    pageSize: number;
  }): Promise<{ items: BookingRow[]; totalItems: number }>;

  listStaffBookings(params: {
    date?: string;
    status?: BookingStatus;
    page: number;
    pageSize: number;
  }): Promise<{ items: StaffBookingView[]; totalItems: number }>;

  findStaffBookingDetail(bookingId: string): Promise<StaffBookingView | null>;
}

function parseUuidParam(val: string, fieldName: string): string {
  const match = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    val
  );
  if (!match) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: `Parameter ${fieldName} harus berupa UUID yang valid.`,
      details: [{ field: fieldName, reason: "INVALID_FORMAT" }],
    });
  }
  return val;
}

function mapBookingRowToPublic(row: BookingRow): Booking {
  return {
    id: row.id,
    booking_code: row.booking_code,
    komting_id: row.komting_id,
    projector_id: row.projector_id,
    booking_date: row.booking_date,
    start_time: row.start_time,
    estimated_return_at: row.estimated_return_at,
    status: row.status as BookingStatus,
    pickup_window: {
      opens_at: row.pickup_window_start_at,
      closes_at: row.pickup_window_end_at,
    },
    created_at: row.created_at,
  };
}

export function createSupabaseBookingRepository(): BookingRepository {
  const admin = createSupabaseAdminClient();

  return {
    async createBookingAtomic(params) {
      // 1. Try atomic RPC from Migration 014
      const { data, error } = await admin.rpc("rpc_komting_create_booking", {
        p_komting_user_id: params.komtingUserId,
        p_projector_id: params.projectorId,
        p_booking_date: params.bookingDate,
        p_start_time: params.startTime,
        p_estimated_return_at: params.estimatedReturnAt,
        p_operating_hours_snapshot: params.operatingHoursSnapshot as unknown as Json,
        p_pickup_window_start_at: params.pickupWindowStartAt,
        p_pickup_window_end_at: params.pickupWindowEndAt,
        p_qr_token_hash: params.qrTokenHash,
        p_qr_expires_at: params.qrExpiresAt,
        p_request_id: params.requestId,
      });

      if (!error && data) {
        return {
          id: (data as Record<string, unknown>).id as string,
          booking_code: (data as Record<string, unknown>).booking_code as string,
          komting_id: (data as Record<string, unknown>).komting_id as string,
          projector_id: (data as Record<string, unknown>).projector_id as string,
          booking_date: (data as Record<string, unknown>).booking_date as string,
          start_time: (data as Record<string, unknown>).start_time as string,
          start_at: (data as Record<string, unknown>).start_at as string,
          estimated_return_at: (data as Record<string, unknown>).estimated_return_at as string,
          status: (data as Record<string, unknown>).status as string,
          operating_hours_snapshot: params.operatingHoursSnapshot as unknown as Json,
          pickup_window_start_at: params.pickupWindowStartAt,
          pickup_window_end_at: params.pickupWindowEndAt,
          cancelled_at: null,
          cancelled_by: null,
          cancel_reason: null,
          created_at: (data as Record<string, unknown>).created_at as string,
          updated_at: (data as Record<string, unknown>).created_at as string,
        } as BookingRow;
      }

      // Check for domain error raised by RPC
      if (error && error.code !== "PGRST202") {
        const msg = error.message;
        if (msg.includes("PINJAM_ERR:ACTIVE_BOOKING_EXISTS")) {
          throw new AuthError({
            status: 409,
            code: "ACTIVE_BOOKING_EXISTS",
            message: "Komting sudah memiliki booking aktif.",
          });
        }
        if (msg.includes("PINJAM_ERR:ACTIVE_LOAN_EXISTS")) {
          throw new AuthError({
            status: 409,
            code: "ACTIVE_LOAN_EXISTS",
            message: "Komting masih memiliki pinjaman aktif yang belum selesai.",
          });
        }
        if (msg.includes("PINJAM_ERR:PROJECTOR_NOT_FOUND")) {
          throw new AuthError({
            status: 404,
            code: "PROJECTOR_NOT_FOUND",
            message: "Unit proyektor tidak ditemukan.",
          });
        }
        if (msg.includes("PINJAM_ERR:PROJECTOR_NOT_BOOKABLE")) {
          throw new AuthError({
            status: 409,
            code: "PROJECTOR_NOT_BOOKABLE",
            message: "Unit proyektor tidak tersedia untuk dibooking pada tanggal tersebut.",
          });
        }
        if (msg.includes("PINJAM_ERR:KOMTING_ASSIGNMENT_REQUIRED")) {
          throw new AuthError({
            status: 403,
            code: "KOMTING_ASSIGNMENT_REQUIRED",
            message: "Pengguna tidak memiliki assignment komting aktif.",
          });
        }
        if (msg.includes("excl_bookings_no_overlap_per_projector") || error.code === "23P01") {
          throw new AuthError({
            status: 409,
            code: "BOOKING_CONFLICT",
            message: "Jadwal yang dipilih bentrok dengan booking terkonfirmasi lainnya.",
          });
        }
        if (msg.includes("uq_bookings_active_per_komting") || error.code === "23505") {
          throw new AuthError({
            status: 409,
            code: "ACTIVE_BOOKING_EXISTS",
            message: "Komting sudah memiliki booking aktif.",
          });
        }
        throw new AuthError({ status: 500, code: "DATABASE_ERROR", message: error.message });
      }

      // 2. Direct transactional fallback when Migration 014 RPC not yet available
      const [{ data: activeBkg }, { data: activeLoan }, { data: proj }] = await Promise.all([
        admin
          .from("bookings")
          .select("id")
          .eq("komting_id", params.komtingUserId)
          .eq("status", "CONFIRMED")
          .maybeSingle(),
        admin
          .from("loans")
          .select("id")
          .eq("komting_id", params.komtingUserId)
          .eq("status", "ACTIVE")
          .maybeSingle(),
        admin
          .from("projectors")
          .select("id, name, physical_status, is_active")
          .eq("id", params.projectorId)
          .maybeSingle(),
      ]);

      if (activeBkg) {
        throw new AuthError({
          status: 409,
          code: "ACTIVE_BOOKING_EXISTS",
          message: "Komting sudah memiliki booking aktif.",
        });
      }

      if (activeLoan) {
        throw new AuthError({
          status: 409,
          code: "ACTIVE_LOAN_EXISTS",
          message: "Komting masih memiliki pinjaman aktif yang belum selesai.",
        });
      }

      if (!proj || !proj.is_active) {
        throw new AuthError({
          status: 409,
          code: "PROJECTOR_NOT_BOOKABLE",
          message: "Unit proyektor tidak ditemukan atau dinonaktifkan.",
        });
      }

      const bookingCode = `BKG-${params.bookingDate.replace(/-/g, "")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      const startAtUtc = jakartaDateTimeToUtc(params.bookingDate, params.startTime).toISOString();

      const { data: created, error: insertErr } = await admin
        .from("bookings")
        .insert({
          booking_code: bookingCode,
          komting_id: params.komtingUserId,
          projector_id: params.projectorId,
          booking_date: params.bookingDate,
          start_time: params.startTime,
          start_at: startAtUtc,
          estimated_return_at: params.estimatedReturnAt,
          status: "CONFIRMED",
          operating_hours_snapshot: params.operatingHoursSnapshot as unknown as Json,
          pickup_window_start_at: params.pickupWindowStartAt,
          pickup_window_end_at: params.pickupWindowEndAt,
        })
        .select("*")
        .single();

      if (insertErr || !created) {
        if (
          insertErr?.code === "23P01" ||
          insertErr?.message?.includes("excl_bookings_no_overlap_per_projector")
        ) {
          throw new AuthError({
            status: 409,
            code: "BOOKING_CONFLICT",
            message: "Jadwal yang dipilih bentrok dengan booking terkonfirmasi lainnya.",
          });
        }
        if (
          insertErr?.code === "23505" &&
          insertErr?.message?.includes("uq_bookings_active_per_komting")
        ) {
          throw new AuthError({
            status: 409,
            code: "ACTIVE_BOOKING_EXISTS",
            message: "Komting sudah memiliki booking aktif.",
          });
        }
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: insertErr?.message ?? "Gagal membuat booking",
        });
      }

      if (params.qrTokenHash) {
        await admin.from("qr_tokens").insert({
          booking_id: created.id,
          token_hash: params.qrTokenHash,
          scope: "PICKUP_AND_RETURN",
          expires_at: params.qrExpiresAt,
        });
      }

      await admin.from("audit_logs").insert({
        actor_user_id: params.komtingUserId,
        actor_role: "KOMTING",
        actor_source: "API",
        action: "BOOKING_CREATED",
        entity_type: "BOOKING",
        entity_id: created.id,
        after_data: {
          booking_code: created.booking_code,
          projector_id: created.projector_id,
          status: created.status,
        },
        request_id: params.requestId,
      });

      return created;
    },

    async cancelBookingAtomic(params) {
      const { data, error } = await admin.rpc("rpc_komting_cancel_booking", {
        p_booking_id: params.bookingId,
        p_komting_user_id: params.komtingUserId,
        p_reason: params.reason,
        p_request_id: params.requestId,
      });

      if (!error && data) {
        const { data: updated } = await admin
          .from("bookings")
          .select("*")
          .eq("id", params.bookingId)
          .single();
        return updated!;
      }

      if (error && error.code !== "PGRST202") {
        const msg = error.message;
        if (msg.includes("PINJAM_ERR:BOOKING_NOT_FOUND")) {
          throw new AuthError({
            status: 404,
            code: "BOOKING_NOT_FOUND",
            message: "Booking tidak ditemukan.",
          });
        }
        if (msg.includes("PINJAM_ERR:FORBIDDEN")) {
          throw new AuthError({
            status: 403,
            code: "FORBIDDEN",
            message: "Anda tidak memiliki akses ke booking ini.",
          });
        }
        if (msg.includes("PINJAM_ERR:BOOKING_CANNOT_BE_CANCELLED")) {
          throw new AuthError({
            status: 409,
            code: "BOOKING_CANNOT_BE_CANCELLED",
            message: "Status booking tidak dapat dibatalkan.",
          });
        }
      }

      // Fallback
      const { data: bkg } = await admin
        .from("bookings")
        .select("*")
        .eq("id", params.bookingId)
        .maybeSingle();

      if (!bkg) {
        throw new AuthError({
          status: 404,
          code: "BOOKING_NOT_FOUND",
          message: "Booking tidak ditemukan.",
        });
      }

      if (bkg.komting_id !== params.komtingUserId) {
        throw new AuthError({
          status: 403,
          code: "FORBIDDEN",
          message: "Anda tidak memiliki akses ke booking ini.",
        });
      }

      if (bkg.status !== "CONFIRMED") {
        throw new AuthError({
          status: 409,
          code: "BOOKING_CANNOT_BE_CANCELLED",
          message: `Booking berstatus ${bkg.status} tidak dapat dibatalkan.`,
        });
      }

      const now = new Date().toISOString();
      const { data: cancelled } = await admin
        .from("bookings")
        .update({
          status: "CANCELLED",
          cancelled_at: now,
          cancelled_by: params.komtingUserId,
          cancel_reason: params.reason,
        })
        .eq("id", params.bookingId)
        .select("*")
        .single();

      await admin.from("qr_tokens").update({ revoked_at: now }).eq("booking_id", params.bookingId);

      await admin.from("audit_logs").insert({
        actor_user_id: params.komtingUserId,
        actor_role: "KOMTING",
        actor_source: "API",
        action: "BOOKING_CANCELLED",
        entity_type: "BOOKING",
        entity_id: params.bookingId,
        before_data: { status: "CONFIRMED" },
        after_data: { status: "CANCELLED", cancelled_at: now },
        reason: params.reason,
        request_id: params.requestId,
      });

      return cancelled!;
    },

    async findBookingById(bookingId) {
      const { data, error } = await admin
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();

      if (error || !data) return null;
      return data;
    },

    async listKomtingBookings({ komtingUserId, status, page, pageSize }) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin
        .from("bookings")
        .select("*", { count: "exact" })
        .eq("komting_id", komtingUserId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error, count } = await query;
      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }

      return {
        items: data ?? [],
        totalItems: count ?? 0,
      };
    },

    async listStaffBookings({ date, status, page, pageSize }) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin
        .from("bookings")
        .select(
          `
          *,
          users!bookings_komting_id_fkey(id, full_name, email),
          projectors!bookings_projector_id_fkey(id, asset_code, name, brand, model, physical_status)
        `,
          { count: "exact" }
        )
        .order("start_at", { ascending: true })
        .range(from, to);

      if (date) query = query.eq("booking_date", date);
      if (status) query = query.eq("status", status);

      const { data, error, count } = await query;
      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }

      const items: StaffBookingView[] = (
        (data as unknown as Array<Record<string, unknown>>) ?? []
      ).map((b) => {
        const user = b.users as { id: string; full_name: string; email: string };
        const proj = b.projectors as {
          id: string;
          asset_code: string;
          name: string;
          brand: string | null;
          model: string | null;
          physical_status: string;
        };
        return {
          ...mapBookingRowToPublic(b as unknown as BookingRow),
          komting: {
            id: user?.id ?? "",
            full_name: user?.full_name ?? "",
            email: user?.email ?? "",
          },
          projector: proj ?? {
            id: "",
            asset_code: "",
            name: "",
            brand: null,
            model: null,
            physical_status: "",
          },
        };
      });

      return {
        items,
        totalItems: count ?? 0,
      };
    },

    async findStaffBookingDetail(bookingId) {
      const { data, error } = await admin
        .from("bookings")
        .select(
          `
          *,
          users!bookings_komting_id_fkey(id, full_name, email),
          projectors!bookings_projector_id_fkey(id, asset_code, name, brand, model, physical_status)
        `
        )
        .eq("id", bookingId)
        .maybeSingle();

      if (error || !data) return null;

      const raw = data as unknown as Record<string, unknown>;
      const user = raw.users as { id: string; full_name: string; email: string };
      const proj = raw.projectors as {
        id: string;
        asset_code: string;
        name: string;
        brand: string | null;
        model: string | null;
        physical_status: string;
      };

      const { data: assign } = await admin
        .from("komting_assignments")
        .select("class_name")
        .eq("user_id", user?.id)
        .eq("status", "ACTIVE")
        .maybeSingle();

      return {
        ...mapBookingRowToPublic(data as unknown as BookingRow),
        komting: {
          id: user?.id ?? "",
          full_name: user?.full_name ?? "",
          email: user?.email ?? "",
          class_name: assign?.class_name ?? undefined,
        },
        projector: proj ?? {
          id: "",
          asset_code: "",
          name: "",
          brand: null,
          model: null,
          physical_status: "",
        },
      };
    },
  };
}

export interface BookingServiceDeps {
  repository?: BookingRepository;
  operatingHoursRepository?: OperatingHoursRepository;
  qrRepository?: QrTokenRepository;
  idempotencyStore?: IdempotencyStore;
}

export async function createBooking(
  context: AuthenticatedUserContext,
  rawBody: unknown,
  idempotencyKey: string | null,
  requestId: string,
  deps: BookingServiceDeps = {}
): Promise<{ status: number; body: { data: BookingCreationResult } }> {
  if (context.user.role !== "KOMTING") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya mahasiswa dengan role KOMTING yang dapat membuat booking.",
    });
  }

  if (context.user.account_status !== "ACTIVE") {
    throw new AuthError({
      status: 403,
      code: "ACCOUNT_NOT_ACTIVE",
      message: "Akun Komting tidak aktif.",
    });
  }

  if (!context.komtingAssignment || context.komtingAssignment.status !== "ACTIVE") {
    throw new AuthError({
      status: 403,
      code: "KOMTING_ASSIGNMENT_REQUIRED",
      message: "Anda tidak memiliki assignment komting aktif.",
    });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Payload harus berupa objek JSON yang valid.",
    });
  }

  const record = rawBody as Record<string, unknown>;
  const projectorId = parseUuidParam(String(record.projector_id ?? ""), "projector_id");
  const bookingDate = String(record.booking_date ?? "").trim();
  const rawStartTime = String(record.start_time ?? "").trim();
  const rawEstReturn = String(record.estimated_return_at ?? "").trim();

  if (!isDateTodayOrTomorrowJakarta(bookingDate)) {
    throw new AuthError({
      status: 422,
      code: "BOOKING_DATE_INVALID",
      message: "Booking hanya dapat dibuat untuk hari ini atau besok zona Asia/Jakarta.",
      details: [{ field: "booking_date", reason: "OUT_OF_RANGE" }],
    });
  }

  const startTime = normalizeTimeString(rawStartTime);
  if (!startTime) {
    throw new AuthError({
      status: 422,
      code: "BOOKING_TIME_INVALID",
      message: "Format start_time harus HH:mm atau HH:mm:ss.",
      details: [{ field: "start_time", reason: "INVALID_FORMAT" }],
    });
  }

  if (isDateTimeInPastJakarta(bookingDate, startTime)) {
    throw new AuthError({
      status: 422,
      code: "BOOKING_TIME_IN_PAST",
      message: "Waktu booking sudah terlewat.",
      details: [{ field: "start_time", reason: "IN_PAST" }],
    });
  }

  const estReturnDate = new Date(rawEstReturn);
  if (Number.isNaN(estReturnDate.getTime())) {
    throw new AuthError({
      status: 422,
      code: "BOOKING_TIME_INVALID",
      message: "Format estimated_return_at harus berupa ISO timestamp yang valid.",
      details: [{ field: "estimated_return_at", reason: "INVALID_ISO_FORMAT" }],
    });
  }

  const estReturnParts = toJakartaLocalParts(rawEstReturn);
  if (estReturnParts.date !== bookingDate) {
    throw new AuthError({
      status: 422,
      code: "BOOKING_TIME_INVALID",
      message: "Estimasi pengembalian harus pada tanggal kalender yang sama dengan booking_date.",
      details: [{ field: "estimated_return_at", reason: "DATE_MISMATCH" }],
    });
  }

  const startUtc = jakartaDateTimeToUtc(bookingDate, startTime);
  if (estReturnDate.getTime() <= startUtc.getTime()) {
    throw new AuthError({
      status: 422,
      code: "BOOKING_TIME_INVALID",
      message: "Estimasi pengembalian harus setelah waktu mulai booking.",
      details: [{ field: "estimated_return_at", reason: "NOT_AFTER_START" }],
    });
  }

  // Check operating hours
  const opHours = await getOperatingHoursForDate(bookingDate, {
    repository: deps.operatingHoursRepository,
  });
  const startSec = timeToSeconds(startTime);
  const returnSec = timeToSeconds(estReturnParts.time);
  const openSec = timeToSeconds(opHours.opens_at);
  const closeSec = timeToSeconds(opHours.closes_at);

  if (startSec < openSec || returnSec > closeSec) {
    throw new AuthError({
      status: 422,
      code: "BOOKING_OUTSIDE_OPERATING_HOURS",
      message: `Waktu booking harus berada di dalam jam operasional (${opHours.opens_at} - ${opHours.closes_at}).`,
      details: [{ field: "operating_hours", reason: "WINDOW_VIOLATION" }],
    });
  }

  const pickupWindow = computePickupWindow(bookingDate, startTime, opHours);
  const qrPayload = generateDeterministicQrPayload({
    komtingId: context.user.id,
    projectorId,
    bookingDate,
    startTime,
    estimatedReturnAt: rawEstReturn,
  });
  const tokenHash = hashQrPayload(qrPayload);
  const repository = deps.repository ?? createSupabaseBookingRepository();

  return withIdempotency({
    actorUserId: context.user.id,
    route: "POST /api/v1/bookings",
    idempotencyKey,
    requestBody: rawBody,
    store: deps.idempotencyStore,
    execute: async () => {
      const created = await repository.createBookingAtomic({
        komtingUserId: context.user.id,
        projectorId,
        bookingDate,
        startTime,
        estimatedReturnAt: rawEstReturn,
        operatingHoursSnapshot: opHours as unknown as Record<string, unknown>,
        pickupWindowStartAt: pickupWindow.opens_at,
        pickupWindowEndAt: pickupWindow.closes_at,
        qrTokenHash: tokenHash,
        qrExpiresAt: pickupWindow.closes_at,
        requestId,
      });

      return {
        status: 201,
        body: {
          data: {
            id: created.id,
            booking_code: created.booking_code,
            status: created.status as BookingStatus,
            projector_id: created.projector_id,
            booking_date: created.booking_date,
            start_time: created.start_time,
            estimated_return_at: created.estimated_return_at,
            pickup_window: {
              opens_at: created.pickup_window_start_at,
              closes_at: created.pickup_window_end_at,
            },
            created_at: created.created_at,
            qr_payload: qrPayload,
          },
        },
      };
    },
  });
}

export async function listKomtingBookings(
  context: AuthenticatedUserContext,
  requestUrl: string,
  deps: BookingServiceDeps = {}
): Promise<{ items: Booking[]; pagination: PaginationMeta }> {
  if (context.user.role !== "KOMTING") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya komting yang dapat melihat daftar booking miliknya.",
    });
  }

  const url = new URL(requestUrl);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get("page_size") ?? 20)));
  const rawStatus = url.searchParams.get("status")?.trim();

  let status: BookingStatus | undefined;
  if (rawStatus) {
    if (!["CONFIRMED", "FULFILLED", "CANCELLED", "EXPIRED"].includes(rawStatus)) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Status booking filter tidak valid.",
      });
    }
    status = rawStatus as BookingStatus;
  }

  const repository = deps.repository ?? createSupabaseBookingRepository();
  const { items, totalItems } = await repository.listKomtingBookings({
    komtingUserId: context.user.id,
    status,
    page,
    pageSize,
  });

  return {
    items: items.map(mapBookingRowToPublic),
    pagination: {
      page,
      page_size: pageSize,
      total_items: totalItems,
      total_pages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    },
  };
}

export async function getKomtingBookingDetail(
  context: AuthenticatedUserContext,
  bookingIdParam: string,
  deps: BookingServiceDeps = {}
): Promise<Booking> {
  if (context.user.role !== "KOMTING") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya komting yang dapat melihat detail booking miliknya.",
    });
  }

  const bookingId = parseUuidParam(bookingIdParam, "booking_id");
  const repository = deps.repository ?? createSupabaseBookingRepository();
  const booking = await repository.findBookingById(bookingId);

  if (!booking) {
    throw new AuthError({
      status: 404,
      code: "BOOKING_NOT_FOUND",
      message: "Booking tidak ditemukan.",
    });
  }

  if (booking.komting_id !== context.user.id) {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Anda tidak berhak melihat booking ini.",
    });
  }

  return mapBookingRowToPublic(booking);
}

export async function cancelBooking(
  context: AuthenticatedUserContext,
  bookingIdParam: string,
  rawBody: unknown,
  requestId: string,
  deps: BookingServiceDeps = {}
): Promise<Booking> {
  if (context.user.role !== "KOMTING") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya komting yang dapat membatalkan booking miliknya.",
    });
  }

  const bookingId = parseUuidParam(bookingIdParam, "booking_id");
  let reason = "Rencana peminjaman dibatalkan.";
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    const r = (rawBody as Record<string, unknown>).reason;
    if (typeof r === "string" && r.trim()) {
      reason = r.trim();
    }
  }

  const repository = deps.repository ?? createSupabaseBookingRepository();
  const updated = await repository.cancelBookingAtomic({
    bookingId,
    komtingUserId: context.user.id,
    reason,
    requestId,
  });

  return mapBookingRowToPublic(updated);
}

export async function listStaffBookings(
  context: AuthenticatedUserContext,
  requestUrl: string,
  deps: BookingServiceDeps = {}
): Promise<{ items: StaffBookingView[]; pagination: PaginationMeta }> {
  if (context.user.role !== "STAFF" && context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya STAFF atau ADMIN yang dapat melihat daftar booking operasional.",
    });
  }

  const url = new URL(requestUrl);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get("page_size") ?? 20)));
  const date = url.searchParams.get("date")?.trim() || undefined;
  const rawStatus = url.searchParams.get("status")?.trim();

  let status: BookingStatus | undefined;
  if (rawStatus) {
    if (!["CONFIRMED", "FULFILLED", "CANCELLED", "EXPIRED"].includes(rawStatus)) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Status booking filter tidak valid.",
      });
    }
    status = rawStatus as BookingStatus;
  }

  const repository = deps.repository ?? createSupabaseBookingRepository();
  const { items, totalItems } = await repository.listStaffBookings({
    date,
    status,
    page,
    pageSize,
  });

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total_items: totalItems,
      total_pages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    },
  };
}

export async function getStaffBookingDetail(
  context: AuthenticatedUserContext,
  bookingIdParam: string,
  deps: BookingServiceDeps = {}
): Promise<StaffBookingView> {
  if (context.user.role !== "STAFF" && context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya STAFF atau ADMIN yang dapat melihat detail booking operasional.",
    });
  }

  const bookingId = parseUuidParam(bookingIdParam, "booking_id");
  const repository = deps.repository ?? createSupabaseBookingRepository();
  const detail = await repository.findStaffBookingDetail(bookingId);

  if (!detail) {
    throw new AuthError({
      status: 404,
      code: "BOOKING_NOT_FOUND",
      message: "Booking tidak ditemukan.",
    });
  }

  return detail;
}

export async function getBookingQrToken(
  context: AuthenticatedUserContext,
  bookingIdParam: string,
  deps: BookingServiceDeps = {}
): Promise<{ qr_payload: string; expires_at: string }> {
  if (context.user.role !== "KOMTING") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya komting yang dapat mengakses QR token booking miliknya.",
    });
  }

  const bookingId = parseUuidParam(bookingIdParam, "booking_id");
  const repository = deps.repository ?? createSupabaseBookingRepository();
  const booking = await repository.findBookingById(bookingId);

  if (!booking) {
    throw new AuthError({
      status: 404,
      code: "BOOKING_NOT_FOUND",
      message: "Booking tidak ditemukan.",
    });
  }

  if (booking.komting_id !== context.user.id) {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Anda tidak memiliki akses ke booking ini.",
    });
  }

  if (booking.status !== "CONFIRMED") {
    throw new AuthError({
      status: 409,
      code: "BOOKING_NOT_CONFIRMED",
      message: `QR hanya tersedia untuk booking dengan status CONFIRMED (saat ini ${booking.status}).`,
    });
  }

  const qrRepo = deps.qrRepository ?? createSupabaseQrRepository();
  const qr = await qrRepo.findTokenByBookingId(bookingId);

  if (!qr) {
    throw new AuthError({
      status: 404,
      code: "QR_NOT_FOUND",
      message: "QR token untuk booking ini tidak ditemukan.",
    });
  }

  if (qr.revoked_at) {
    throw new AuthError({
      status: 422,
      code: "QR_EXPIRED",
      message: "QR token telah dicabut.",
    });
  }

  const now = Date.now();
  const expiresAtMs = new Date(qr.expires_at).getTime();
  if (now > expiresAtMs) {
    throw new AuthError({
      status: 422,
      code: "QR_EXPIRED",
      message: "QR token telah kedaluwarsa.",
    });
  }

  // 1. Try deterministic HMAC generation (read-only verification for newly created bookings)
  const deterministicPayload = generateDeterministicQrPayload({
    komtingId: booking.komting_id,
    projectorId: booking.projector_id,
    bookingDate: booking.booking_date,
    startTime: booking.start_time,
    estimatedReturnAt: booking.estimated_return_at,
  });

  if (hashQrPayload(deterministicPayload) === qr.token_hash) {
    return {
      qr_payload: deterministicPayload,
      expires_at: qr.expires_at,
    };
  }

  // 2. Fallback to idempotency records (read-only retrieval for pre-existing bookings like BKG-20261128-3465)
  if (qrRepo.findCachedPayloadByBookingId) {
    const cachedPayload = await qrRepo.findCachedPayloadByBookingId(booking.id, booking.komting_id);
    if (cachedPayload && hashQrPayload(cachedPayload) === qr.token_hash) {
      return {
        qr_payload: cachedPayload,
        expires_at: qr.expires_at,
      };
    }
  }

  // 3. Fallback if payload cannot be securely verified against immutable token_hash
  throw new AuthError({
    status: 404,
    code: "QR_NOT_FOUND",
    message: "Payload QR token tidak dapat diverifikasi.",
  });
}

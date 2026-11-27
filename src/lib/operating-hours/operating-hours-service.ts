import "server-only";

import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OperatingHoursRow } from "@/lib/supabase/database.types";
import {
  buildOperatingHoursSnapshot,
  isValidCalendarDate,
  normalizeTimeString,
  timeToSeconds,
} from "@/lib/utils/jakarta-time";
import type { OperatingHoursSnapshot } from "@/types/domain";

const ALLOWED_PUT_FIELDS = new Set(["opens_at", "closes_at", "admin_early_open_at", "note"]);

export interface ConflictingBookingSummary {
  booking_id: string;
  booking_code: string;
  projector_id: string;
  start_time: string;
  estimated_return_at: string;
}

export interface UpsertOperatingHoursRpcResult {
  conflict: boolean;
  conflicting_bookings?: ConflictingBookingSummary[];
  operating_hours?: {
    id: string;
    service_date: string;
    timezone: string;
    opens_at: string;
    closes_at: string;
    admin_early_open_at: string | null;
    note: string | null;
  };
}

export interface OperatingHoursRepository {
  getByServiceDate(serviceDate: string): Promise<OperatingHoursRow | null>;
  upsertOperatingHoursAtomic(params: {
    serviceDate: string;
    opensAt: string;
    closesAt: string;
    adminEarlyOpenAt: string | null;
    note: string | null;
    adminUserId: string;
    requestId: string;
  }): Promise<UpsertOperatingHoursRpcResult>;
}

export interface OperatingHoursServiceDeps {
  repository?: OperatingHoursRepository;
}

function mapOperatingHoursDbError(error: { code?: string; message: string }): AuthError {
  const msg = error.message;

  if (msg.includes("PINJAM_ERR:INVALID_OPERATING_WINDOW")) {
    return new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Jam tutup operasional harus lebih akhir dari jam buka.",
      details: [{ field: "closes_at", reason: "INVALID_WINDOW" }],
    });
  }
  if (msg.includes("PINJAM_ERR:INVALID_EARLY_OPEN")) {
    return new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "admin_early_open_at tidak boleh lebih lambat dari opens_at.",
      details: [{ field: "admin_early_open_at", reason: "INVALID_EARLY_OPEN" }],
    });
  }

  return new AuthError({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Terjadi kesalahan internal saat memproses jam operasional.",
  });
}

export function createSupabaseOperatingHoursRepository(): OperatingHoursRepository {
  const admin = createSupabaseAdminClient();

  return {
    async getByServiceDate(serviceDate) {
      const { data, error } = await admin
        .from("operating_hours")
        .select("*")
        .eq("service_date", serviceDate)
        .maybeSingle();

      if (error) throw mapOperatingHoursDbError(error);
      return data;
    },

    async upsertOperatingHoursAtomic({
      serviceDate,
      opensAt,
      closesAt,
      adminEarlyOpenAt,
      note,
      adminUserId,
      requestId,
    }) {
      const { data, error } = await admin.rpc("rpc_admin_upsert_operating_hours", {
        p_service_date: serviceDate,
        p_opens_at: opensAt,
        p_closes_at: closesAt,
        p_admin_early_open_at: adminEarlyOpenAt,
        p_note: note,
        p_admin_user_id: adminUserId,
        p_request_id: requestId,
      });

      if (error) throw mapOperatingHoursDbError(error);
      return data as unknown as UpsertOperatingHoursRpcResult;
    },
  };
}

export async function getOperatingHoursForDate(
  dateOrUrl: string,
  deps: OperatingHoursServiceDeps = {}
): Promise<OperatingHoursSnapshot & { note: string | null }> {
  let rawDate = "";
  const trimmed = dateOrUrl.trim();
  if (isValidCalendarDate(trimmed)) {
    rawDate = trimmed;
  } else {
    try {
      const url = new URL(trimmed);
      rawDate = url.searchParams.get("date")?.trim() ?? "";
    } catch {
      rawDate = "";
    }
  }

  if (!rawDate || !isValidCalendarDate(rawDate)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Parameter query date wajib berformat YYYY-MM-DD yang valid.",
      details: [{ field: "date", reason: "INVALID_DATE" }],
    });
  }

  const repository = deps.repository ?? createSupabaseOperatingHoursRepository();
  const row = await repository.getByServiceDate(rawDate);

  if (!row) {
    return buildOperatingHoursSnapshot({ serviceDate: rawDate });
  }

  return buildOperatingHoursSnapshot({
    serviceDate: row.service_date,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    adminEarlyOpenAt: row.admin_early_open_at,
    note: row.note,
  });
}

export async function updateOperatingHoursForDate(
  adminContext: AuthenticatedUserContext,
  dateParam: string,
  rawBody: unknown,
  requestId: string,
  deps: OperatingHoursServiceDeps = {}
): Promise<OperatingHoursSnapshot & { note: string | null }> {
  const serviceDate = dateParam.trim();
  if (!isValidCalendarDate(serviceDate)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Parameter tanggal harus berformat YYYY-MM-DD yang valid.",
      details: [{ field: "date", reason: "INVALID_DATE" }],
    });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Body permintaan harus berupa objek JSON yang valid.",
    });
  }

  const record = rawBody as Record<string, unknown>;
  const disallowed = Object.keys(record).filter((k) => !ALLOWED_PUT_FIELDS.has(k));
  if (disallowed.length > 0) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Terdapat field yang tidak diizinkan pada konfigurasi jam operasional.",
      details: disallowed.map((field) => ({ field, reason: "FIELD_NOT_ALLOWED" })),
    });
  }

  const rawOpensAt = typeof record.opens_at === "string" ? record.opens_at : "";
  const rawClosesAt = typeof record.closes_at === "string" ? record.closes_at : "";
  const opensAt = normalizeTimeString(rawOpensAt);
  const closesAt = normalizeTimeString(rawClosesAt);

  const invalidTimeDetails: Array<{ field: string; reason: string }> = [];
  if (!opensAt) invalidTimeDetails.push({ field: "opens_at", reason: "INVALID_TIME" });
  if (!closesAt) invalidTimeDetails.push({ field: "closes_at", reason: "INVALID_TIME" });

  let adminEarlyOpenAt: string | null = null;
  if ("admin_early_open_at" in record && record.admin_early_open_at !== null) {
    if (typeof record.admin_early_open_at !== "string") {
      invalidTimeDetails.push({ field: "admin_early_open_at", reason: "INVALID_TYPE" });
    } else {
      const parsedEarly = normalizeTimeString(record.admin_early_open_at);
      if (!parsedEarly) {
        invalidTimeDetails.push({ field: "admin_early_open_at", reason: "INVALID_TIME" });
      } else {
        adminEarlyOpenAt = parsedEarly;
      }
    }
  }

  let note: string | null = null;
  if ("note" in record && record.note !== null) {
    if (typeof record.note !== "string") {
      invalidTimeDetails.push({ field: "note", reason: "INVALID_TYPE" });
    } else {
      note = record.note.trim() || null;
    }
  }

  if (invalidTimeDetails.length > 0 || !opensAt || !closesAt) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Konfigurasi jam operasional tidak valid.",
      details: invalidTimeDetails,
    });
  }

  if (timeToSeconds(closesAt) <= timeToSeconds(opensAt)) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Jam tutup operasional harus lebih akhir dari jam buka.",
      details: [{ field: "closes_at", reason: "MUST_BE_AFTER_OPENS_AT" }],
    });
  }

  if (adminEarlyOpenAt && timeToSeconds(adminEarlyOpenAt) > timeToSeconds(opensAt)) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "admin_early_open_at tidak boleh lebih lambat dari opens_at.",
      details: [{ field: "admin_early_open_at", reason: "MUST_NOT_EXCEED_OPENS_AT" }],
    });
  }

  const repository = deps.repository ?? createSupabaseOperatingHoursRepository();
  const result = await repository.upsertOperatingHoursAtomic({
    serviceDate,
    opensAt,
    closesAt,
    adminEarlyOpenAt,
    note,
    adminUserId: adminContext.user.id,
    requestId,
  });

  if (result.conflict) {
    const conflicts = result.conflicting_bookings ?? [];
    throw new AuthError({
      status: 409,
      code: "OPERATING_HOURS_CONFLICT",
      message:
        "Perubahan jam operasional bertabrakan dengan booking aktif yang sudah terkonfirmasi.",
      details: conflicts.map((c) => ({
        field: c.booking_code,
        reason: `BOOKING_CONFLICT_${c.start_time}`,
      })),
    });
  }

  const saved = result.operating_hours;
  return buildOperatingHoursSnapshot({
    serviceDate: saved?.service_date ?? serviceDate,
    opensAt: saved?.opens_at ?? opensAt,
    closesAt: saved?.closes_at ?? closesAt,
    adminEarlyOpenAt: saved?.admin_early_open_at ?? adminEarlyOpenAt,
    note: saved?.note ?? note,
  });
}

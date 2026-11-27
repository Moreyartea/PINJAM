import "server-only";

import { AuthError } from "@/lib/auth/errors";
import { parseUuidParam } from "@/lib/http/request";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OperatingHoursRow, ProjectorRow } from "@/lib/supabase/database.types";
import {
  buildOperatingHoursSnapshot,
  getJakartaNowParts,
  isValidCalendarDate,
  secondsToTimeString,
  timeToSeconds,
  toJakartaLocalParts,
} from "@/lib/utils/jakarta-time";
import type { AvailabilityResult } from "@/types/domain";

export interface AvailabilityBookedSlot {
  start_time: string;
  end_time: string;
  start_at: string;
  estimated_return_at: string;
}

export interface AvailabilityTimeWindow {
  start_time: string;
  end_time: string;
}

export interface AvailabilityResponsePayload extends AvailabilityResult {
  booked_slots: AvailabilityBookedSlot[];
  available_windows: AvailabilityTimeWindow[];
}

export interface ConfirmedBookingWindowRow {
  start_time: string;
  start_at: string;
  estimated_return_at: string;
}

export interface AvailabilityRepository {
  getProjectorById(projectorId: string): Promise<ProjectorRow | null>;
  getOperatingHoursByDate(serviceDate: string): Promise<OperatingHoursRow | null>;
  listConfirmedBookingsForProjectorDate(
    projectorId: string,
    serviceDate: string
  ): Promise<ConfirmedBookingWindowRow[]>;
}

export interface AvailabilityServiceDeps {
  repository?: AvailabilityRepository;
  now?: Date;
}

export function createSupabaseAvailabilityRepository(): AvailabilityRepository {
  const admin = createSupabaseAdminClient();

  return {
    async getProjectorById(projectorId) {
      const { data, error } = await admin
        .from("projectors")
        .select("*")
        .eq("id", projectorId)
        .maybeSingle();

      if (error) {
        throw new AuthError({
          status: 500,
          code: "INTERNAL_ERROR",
          message: "Gagal membaca data proyektor untuk pemeriksaan ketersediaan.",
        });
      }
      return data;
    },

    async getOperatingHoursByDate(serviceDate) {
      const { data, error } = await admin
        .from("operating_hours")
        .select("*")
        .eq("service_date", serviceDate)
        .maybeSingle();

      if (error) {
        throw new AuthError({
          status: 500,
          code: "INTERNAL_ERROR",
          message: "Gagal membaca konfigurasi jam operasional.",
        });
      }
      return data;
    },

    async listConfirmedBookingsForProjectorDate(projectorId, serviceDate) {
      const { data, error } = await admin
        .from("bookings")
        .select("start_time, start_at, estimated_return_at")
        .eq("projector_id", projectorId)
        .eq("booking_date", serviceDate)
        .eq("status", "CONFIRMED")
        .order("start_at", { ascending: true });

      if (error) {
        throw new AuthError({
          status: 500,
          code: "INTERNAL_ERROR",
          message: "Gagal membaca jadwal booking proyektor.",
        });
      }
      return data ?? [];
    },
  };
}

function computeAvailableWindows(params: {
  windowStartSec: number;
  windowEndSec: number;
  bookedIntervalsSec: Array<{ start: number; end: number }>;
}): AvailabilityTimeWindow[] {
  const { windowStartSec, windowEndSec, bookedIntervalsSec } = params;
  if (windowEndSec <= windowStartSec) return [];

  const sorted = [...bookedIntervalsSec].sort((a, b) => a.start - b.start);
  const freeWindows: AvailabilityTimeWindow[] = [];
  let cursor = windowStartSec;

  for (const interval of sorted) {
    const clampedStart = Math.max(cursor, interval.start);
    const clampedEnd = Math.min(windowEndSec, interval.end);
    if (clampedEnd <= cursor) continue;

    if (clampedStart > cursor) {
      freeWindows.push({
        start_time: secondsToTimeString(cursor),
        end_time: secondsToTimeString(clampedStart),
      });
    }
    cursor = Math.max(cursor, clampedEnd);
    if (cursor >= windowEndSec) break;
  }

  if (cursor < windowEndSec) {
    freeWindows.push({
      start_time: secondsToTimeString(cursor),
      end_time: secondsToTimeString(windowEndSec),
    });
  }

  return freeWindows;
}

export async function checkProjectorAvailability(
  requestUrl: string,
  deps: AvailabilityServiceDeps = {}
): Promise<AvailabilityResponsePayload> {
  const url = new URL(requestUrl);
  const rawProjectorId = url.searchParams.get("projector_id")?.trim() ?? "";
  const rawDate = url.searchParams.get("date")?.trim() ?? "";

  if (!rawProjectorId) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Parameter query projector_id wajib diisi.",
      details: [{ field: "projector_id", reason: "REQUIRED" }],
    });
  }
  const projectorId = parseUuidParam(rawProjectorId, "projector_id");

  if (!rawDate || !isValidCalendarDate(rawDate)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Parameter query date wajib berformat YYYY-MM-DD yang valid.",
      details: [{ field: "date", reason: "INVALID_DATE" }],
    });
  }

  const repository = deps.repository ?? createSupabaseAvailabilityRepository();
  const projector = await repository.getProjectorById(projectorId);
  if (!projector) {
    throw new AuthError({
      status: 404,
      code: "PROJECTOR_NOT_FOUND",
      message: "Unit proyektor tidak ditemukan.",
    });
  }

  const [hoursRow, bookings] = await Promise.all([
    repository.getOperatingHoursByDate(rawDate),
    repository.listConfirmedBookingsForProjectorDate(projectorId, rawDate),
  ]);

  const operatingHours = hoursRow
    ? buildOperatingHoursSnapshot({
        serviceDate: hoursRow.service_date,
        opensAt: hoursRow.opens_at,
        closesAt: hoursRow.closes_at,
        adminEarlyOpenAt: hoursRow.admin_early_open_at,
        note: hoursRow.note,
      })
    : buildOperatingHoursSnapshot({ serviceDate: rawDate });

  const { today, tomorrow, time: nowTime } = getJakartaNowParts(deps.now ?? new Date());
  const opensSec = timeToSeconds(operatingHours.opens_at);
  const closesSec = timeToSeconds(operatingHours.closes_at);
  const nowSec = timeToSeconds(nowTime);

  const bookedSlots: AvailabilityBookedSlot[] = bookings.map((b) => {
    const startLocal = toJakartaLocalParts(b.start_at);
    const endLocal = toJakartaLocalParts(b.estimated_return_at);
    return {
      start_time: startLocal.time,
      end_time: endLocal.time,
      start_at: b.start_at,
      estimated_return_at: b.estimated_return_at,
    };
  });

  const bookedIntervalsSec = bookedSlots.map((slot) => ({
    start: timeToSeconds(slot.start_time),
    end: timeToSeconds(slot.end_time),
  }));

  const isWithinAllowedDateWindow = rawDate === today || rawDate === tomorrow;
  const effectiveStartSec = rawDate === today ? Math.max(opensSec, nowSec) : opensSec;

  const availableWindows = isWithinAllowedDateWindow
    ? computeAvailableWindows({
        windowStartSec: effectiveStartSec,
        windowEndSec: closesSec,
        bookedIntervalsSec,
      })
    : [];

  let isBookable = false;
  let message: string | null = null;

  if (!projector.is_active || projector.physical_status === "INACTIVE") {
    isBookable = false;
    message = "Unit proyektor berstatus nonaktif dan tidak dapat dibooking.";
  } else if (projector.physical_status === "MAINTENANCE") {
    isBookable = false;
    message = "Unit proyektor sedang dalam maintenance dan tidak dapat dibooking.";
  } else if (!isWithinAllowedDateWindow) {
    isBookable = false;
    message = "Booking hanya dapat dilakukan untuk hari ini atau besok (Asia/Jakarta).";
  } else if (rawDate === today && projector.physical_status === "BORROWED") {
    isBookable = false;
    message = "Unit proyektor sedang dipinjam pada hari ini.";
  } else if (rawDate === today && nowSec >= closesSec) {
    isBookable = false;
    message = "Jam operasional hari ini telah berakhir.";
  } else if (availableWindows.length === 0) {
    isBookable = false;
    message = "Seluruh slot jam operasional pada tanggal ini sudah terbooking.";
  } else {
    isBookable = true;
    message =
      bookedSlots.length > 0
        ? "Sebagian rentang waktu sudah terbooking; slot lain masih tersedia."
        : null;
  }

  return {
    projector_id: projector.id,
    date: rawDate,
    is_bookable: isBookable,
    physical_status: projector.physical_status,
    operating_hours: {
      service_date: operatingHours.service_date,
      timezone: operatingHours.timezone,
      opens_at: operatingHours.opens_at,
      closes_at: operatingHours.closes_at,
      configured_open_at: operatingHours.configured_open_at,
      early_pickup_allowed_at: operatingHours.early_pickup_allowed_at,
    },
    message,
    booked_slots: bookedSlots,
    available_windows: availableWindows,
  };
}

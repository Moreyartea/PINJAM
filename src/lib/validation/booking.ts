import {
  getJakartaCurrentTimeString,
  getJakartaDateString,
  getJakartaTomorrowDateString,
} from "@/lib/utils/date";
import type { OperatingHoursSnapshot } from "@/types/domain";

export interface BookingFormValues {
  projectorId: string;
  bookingDate: string;
  startTime: string;
  estimatedReturnTime: string;
}

export interface BookingValidationErrors {
  projectorId?: string;
  bookingDate?: string;
  startTime?: string;
  estimatedReturnTime?: string;
  operatingHours?: string;
}

export interface BookingTimeBounds {
  isToday: boolean;
  isTodayBookable: boolean;
  minStartTime: string;
  maxStartTime: string;
  defaultStartTime: string;
  minReturnTime: string;
  maxReturnTime: string;
  defaultReturnTime: string;
  unavailabilityReason: string | null;
}

const TIME_HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toMinutes(timeStr: string): number {
  const parts = timeStr.slice(0, 5).split(":");
  const hours = Number(parts[0] ?? 0);
  const mins = Number(parts[1] ?? 0);
  return hours * 60 + mins;
}

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function formatHHmm(timeStr: string): string {
  return timeStr.slice(0, 5);
}

/**
 * Calculates adaptive time bounds and valid default suggestions for booking
 * based on Jakarta timezone and backend operating hours.
 */
export function getBookingTimeBounds(
  bookingDate: string,
  operatingHours: OperatingHoursSnapshot | null,
  now: Date = new Date()
): BookingTimeBounds {
  const today = getJakartaDateString(now);
  const isToday = bookingDate === today;
  const currentJakartaTime = getJakartaCurrentTimeString(now);
  const currentMin = toMinutes(currentJakartaTime);

  const opensAt = operatingHours ? formatHHmm(operatingHours.opens_at) : "08:00";
  const closesAt = operatingHours ? formatHHmm(operatingHours.closes_at) : "17:00";
  const openMin = toMinutes(opensAt);
  const closeMin = toMinutes(closesAt);

  // Maximum start time: must leave at least 15 minutes before closing
  const maxStartMin = Math.max(openMin, closeMin - 15);
  const maxStartTime = minutesToTime(maxStartMin);
  const maxReturnTime = closesAt;

  if (isToday) {
    // If current time is already >= maxStartMin or past closesAt, today has no valid slots
    if (currentMin >= maxStartMin) {
      return {
        isToday: true,
        isTodayBookable: false,
        minStartTime: opensAt,
        maxStartTime,
        defaultStartTime: opensAt,
        minReturnTime: opensAt,
        maxReturnTime,
        defaultReturnTime: closesAt,
        unavailabilityReason: `Jam operasional untuk hari ini telah berakhir (tutup pukul ${closesAt} WIB). Silakan pilih tanggal besok untuk melakukan booking.`,
      };
    }

    // Earliest start time: cannot be in the past or before openMin.
    // Suggest next 15-minute slot after current time with at least 5 minutes leeway.
    let startMin: number;
    if (currentMin < openMin) {
      startMin = openMin;
    } else {
      startMin = Math.ceil((currentMin + 5) / 15) * 15;
      if (startMin > maxStartMin) {
        startMin = maxStartMin;
      }
    }

    const defaultStartTime = minutesToTime(startMin);
    const minStartTime = minutesToTime(Math.max(openMin, currentMin + 1));
    const defaultReturnMin = Math.min(startMin + 120, closeMin);
    const defaultReturnTime = minutesToTime(defaultReturnMin);
    const minReturnTime = minutesToTime(startMin + 1);

    return {
      isToday: true,
      isTodayBookable: true,
      minStartTime,
      maxStartTime,
      defaultStartTime,
      minReturnTime,
      maxReturnTime,
      defaultReturnTime,
      unavailabilityReason: null,
    };
  }

  // Tomorrow / future allowed date
  const defaultStartMin = Math.max(openMin, 9 * 60); // 09:00 or opensAt
  const defaultStartTime = minutesToTime(defaultStartMin);
  const defaultReturnMin = Math.min(defaultStartMin + 120, closeMin);
  const defaultReturnTime = minutesToTime(defaultReturnMin);

  return {
    isToday: false,
    isTodayBookable: true,
    minStartTime: opensAt,
    maxStartTime,
    defaultStartTime,
    minReturnTime: opensAt,
    maxReturnTime,
    defaultReturnTime,
    unavailabilityReason: null,
  };
}

/**
 * Advisory client-side validation following PRD & API Contract booking rules.
 * Backend remains the final authority for all booking business rules.
 */
export function validateBookingForm(
  values: BookingFormValues,
  operatingHours: OperatingHoursSnapshot | null,
  now: Date = new Date()
): BookingValidationErrors {
  const errors: BookingValidationErrors = {};

  if (!values.projectorId.trim()) {
    errors.projectorId = "Pilih unit proyektor terlebih dahulu.";
  }

  const today = getJakartaDateString(now);
  const tomorrow = getJakartaTomorrowDateString(now);

  if (!values.bookingDate) {
    errors.bookingDate = "Tanggal booking wajib dipilih.";
  } else if (values.bookingDate !== today && values.bookingDate !== tomorrow) {
    errors.bookingDate = "Booking hanya dapat dibuat untuk hari ini atau besok (Asia/Jakarta).";
  }

  if (values.bookingDate === today && operatingHours) {
    const closeMin = toMinutes(operatingHours.closes_at);
    const currentMin = toMinutes(getJakartaCurrentTimeString(now));
    if (currentMin >= closeMin - 15) {
      errors.bookingDate = `Jam operasional untuk hari ini telah berakhir (tutup pukul ${formatHHmm(operatingHours.closes_at)} WIB). Silakan pilih tanggal besok.`;
    }
  }

  const validStart = TIME_HH_MM_PATTERN.test(values.startTime);
  if (!values.startTime) {
    errors.startTime = "Waktu mulai wajib diisi.";
  } else if (!validStart) {
    errors.startTime = "Format waktu mulai tidak valid (JJ:MM).";
  }

  const validReturn = TIME_HH_MM_PATTERN.test(values.estimatedReturnTime);
  if (!values.estimatedReturnTime) {
    errors.estimatedReturnTime = "Estimasi pengembalian wajib diisi.";
  } else if (!validReturn) {
    errors.estimatedReturnTime = "Format estimasi pengembalian tidak valid (JJ:MM).";
  }

  if (validStart && values.bookingDate === today) {
    const currentJakartaTime = getJakartaCurrentTimeString(now);
    if (toMinutes(values.startTime) <= toMinutes(currentJakartaTime)) {
      errors.startTime = "Waktu mulai tidak boleh berada di masa lalu.";
    }
  }

  if (validStart && validReturn) {
    if (toMinutes(values.estimatedReturnTime) <= toMinutes(values.startTime)) {
      errors.estimatedReturnTime =
        "Estimasi pengembalian harus setelah waktu mulai pada tanggal kalender yang sama.";
    }
  }

  if (!operatingHours) {
    errors.operatingHours =
      "Jam operasional layanan dari backend belum tersedia. Muat ulang jam operasional terlebih dahulu.";
  } else {
    const openMin = toMinutes(operatingHours.opens_at);
    const closeMin = toMinutes(operatingHours.closes_at);
    const openLabel = formatHHmm(operatingHours.opens_at);
    const closeLabel = formatHHmm(operatingHours.closes_at);

    if (validStart) {
      const startMin = toMinutes(values.startTime);
      if (startMin < openMin || startMin >= closeMin) {
        errors.startTime = `Waktu mulai harus berada dalam jam operasional (${openLabel}–${closeLabel} WIB).`;
      }
    }

    if (validReturn) {
      const returnMin = toMinutes(values.estimatedReturnTime);
      if (returnMin > closeMin) {
        errors.estimatedReturnTime = `Estimasi pengembalian paling lambat pada jam tutup operasional (${closeLabel} WIB) di hari yang sama.`;
      }
    }
  }

  return errors;
}

export function validateCancelReason(reason: string): string | undefined {
  if (!reason.trim()) {
    return "Alasan pembatalan wajib diisi.";
  }
  if (reason.trim().length < 5) {
    return "Alasan pembatalan minimal 5 karakter.";
  }
  return undefined;
}

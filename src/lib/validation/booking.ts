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

const TIME_HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(timeStr: string): number {
  const parts = timeStr.slice(0, 5).split(":");
  const hours = Number(parts[0] ?? 0);
  const mins = Number(parts[1] ?? 0);
  return hours * 60 + mins;
}

function formatHHmm(timeStr: string): string {
  return timeStr.slice(0, 5);
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

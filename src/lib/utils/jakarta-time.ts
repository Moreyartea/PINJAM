import type { OperatingHoursSnapshot } from "@/types/domain";

export const JAKARTA_TIMEZONE = "Asia/Jakarta";
export const STANDARD_OPENS_AT = "08:00:00";
export const STANDARD_CLOSES_AT = "17:00:00";
export const STANDARD_EARLY_PICKUP_AT = "07:45:00";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Validates strict YYYY-MM-DD calendar date (rejects invalid month/day like 2026-02-30).
 */
export function isValidCalendarDate(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/**
 * Adds integer days to a valid YYYY-MM-DD date string cleanly without DST issues.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid calendar date: ${dateStr}`);
  }
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  const d = new Date(utc);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Normalizes HH:mm or HH:mm:ss to HH:mm:ss, returning null when invalid.
 */
export function normalizeTimeString(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function timeToSeconds(hhmmss: string): number {
  const normalized = normalizeTimeString(hhmmss);
  if (!normalized) {
    throw new Error(`Invalid time string: ${hhmmss}`);
  }
  const parts = normalized.split(":");
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
}

export function secondsToTimeString(totalSeconds: number): string {
  const clamped = Math.max(0, Math.min(23 * 3600 + 59 * 60 + 59, Math.floor(totalSeconds)));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/**
 * Converts a JS Date (instant) into Asia/Jakarta local date (YYYY-MM-DD) and local time (HH:mm:ss).
 * Asia/Jakarta has fixed UTC+07:00 offset with no DST.
 */
export function getJakartaNowParts(now: Date = new Date()): {
  today: string;
  tomorrow: string;
  time: string;
} {
  const jakartaMs = now.getTime() + 7 * 60 * 60 * 1000;
  const shifted = new Date(jakartaMs);
  const today = `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
  const time = `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}`;
  return {
    today,
    tomorrow: addCalendarDays(today, 1),
    time,
  };
}

/**
 * Extracts Asia/Jakarta calendar date and local HH:mm:ss from an ISO timestamp.
 */
export function toJakartaLocalParts(isoTimestamp: string): { date: string; time: string } {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${isoTimestamp}`);
  }
  const parts = getJakartaNowParts(parsed);
  return { date: parts.today, time: parts.time };
}

/**
 * Computes `early_pickup_allowed_at` per PRD §7.9 & API Contract §4.7 / §9.3:
 * - Standard open 08:00:00 (no admin_early_open_at) allows pickup from 07:45:00.
 * - Custom admin_early_open_at (e.g. 07:00:00) allows pickup 30 min after early open (07:30:00),
 *   never later than the standard 15-min pre-open threshold.
 */
export function computeEarlyPickupAllowedAt(
  opensAt: string,
  adminEarlyOpenAt: string | null
): string {
  const opensSec = timeToSeconds(opensAt);
  const defaultPreOpenSec = Math.max(0, opensSec - 15 * 60);

  if (!adminEarlyOpenAt) {
    return secondsToTimeString(defaultPreOpenSec);
  }

  const earlyOpenSec = timeToSeconds(adminEarlyOpenAt);
  const effectiveEarlySec = Math.min(defaultPreOpenSec, earlyOpenSec + 30 * 60);
  return secondsToTimeString(effectiveEarlySec);
}

export function buildOperatingHoursSnapshot(params: {
  serviceDate: string;
  opensAt?: string;
  closesAt?: string;
  adminEarlyOpenAt?: string | null;
  note?: string | null;
}): OperatingHoursSnapshot & { note: string | null } {
  const opensAt = normalizeTimeString(params.opensAt ?? STANDARD_OPENS_AT) ?? STANDARD_OPENS_AT;
  const closesAt = normalizeTimeString(params.closesAt ?? STANDARD_CLOSES_AT) ?? STANDARD_CLOSES_AT;
  const adminEarlyOpenAt = params.adminEarlyOpenAt
    ? normalizeTimeString(params.adminEarlyOpenAt)
    : null;

  return {
    service_date: params.serviceDate,
    timezone: JAKARTA_TIMEZONE,
    opens_at: opensAt,
    closes_at: closesAt,
    configured_open_at: opensAt,
    early_pickup_allowed_at: computeEarlyPickupAllowedAt(opensAt, adminEarlyOpenAt),
    admin_early_open_at: adminEarlyOpenAt ?? null,
    note: params.note ?? null,
  };
}

/**
 * Parses local date and time in Asia/Jakarta (UTC+07:00) into a UTC Date.
 */
export function jakartaDateTimeToUtc(dateStr: string, timeStr: string): Date {
  const normTime = normalizeTimeString(timeStr);
  if (!normTime || !isValidCalendarDate(dateStr)) {
    throw new Error(`Invalid date or time: ${dateStr} ${timeStr}`);
  }
  return new Date(`${dateStr}T${normTime}+07:00`);
}

/**
 * Checks if dateStr is today or tomorrow in Asia/Jakarta.
 */
export function isDateTodayOrTomorrowJakarta(dateStr: string, now: Date = new Date()): boolean {
  if (!isValidCalendarDate(dateStr)) return false;
  const { today, tomorrow } = getJakartaNowParts(now);
  return dateStr === today || dateStr === tomorrow;
}

/**
 * Checks if a given date and time in Asia/Jakarta is strictly in the past relative to now.
 */
export function isDateTimeInPastJakarta(
  dateStr: string,
  timeStr: string,
  now: Date = new Date()
): boolean {
  try {
    const targetUtc = jakartaDateTimeToUtc(dateStr, timeStr);
    return targetUtc.getTime() <= now.getTime();
  } catch {
    return true;
  }
}

/**
 * Computes pickup window ISO UTC timestamps per PRD §7.8 & §7.9:
 * - closes_at: start_at + 15 minutes
 * - opens_at: latest of (early_pickup_allowed_at on booking_date, start_at - 30 minutes)
 */
export function computePickupWindow(
  dateStr: string,
  startTimeStr: string,
  operatingHoursSnapshot: { early_pickup_allowed_at: string }
): { opens_at: string; closes_at: string } {
  const startUtc = jakartaDateTimeToUtc(dateStr, startTimeStr);
  const closesAtUtc = new Date(startUtc.getTime() + 15 * 60 * 1000).toISOString();

  const startSec = timeToSeconds(startTimeStr);
  const earlyOpenSec = timeToSeconds(operatingHoursSnapshot.early_pickup_allowed_at);
  const pre30Sec = Math.max(0, startSec - 30 * 60);
  const effectiveOpenSec = Math.max(earlyOpenSec, pre30Sec);

  const effectiveOpenTimeStr = secondsToTimeString(effectiveOpenSec);
  const opensAtUtc = jakartaDateTimeToUtc(dateStr, effectiveOpenTimeStr).toISOString();

  return {
    opens_at: opensAtUtc,
    closes_at: closesAtUtc,
  };
}

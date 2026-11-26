import { env } from "@/lib/config/env";

const JAKARTA_TZ = env.timezone || "Asia/Jakarta";

/**
 * Formats an ISO 8601 timestamp into Asia/Jakarta local date + time for display only.
 * Never use client formatting as business-rule truth.
 */
export function formatJakartaDateTime(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "-";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Formats an ISO 8601 timestamp into Asia/Jakarta HH:mm WIB time for display.
 */
export function formatJakartaTimeOnly(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "-";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "-";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: JAKARTA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${formatted} WIB`;
}

/**
 * Formats a calendar date string (YYYY-MM-DD) for display in Indonesian locale.
 */
export function formatCalendarDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const utcMidday = new Date(Date.UTC(year, month, day, 5, 0, 0));

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(utcMidday);
}

/**
 * Formats a local time string (HH:mm:ss or HH:mm) as HH:mm WIB.
 */
export function formatLocalTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "-";
  const match = /^(\d{2}):(\d{2})/.exec(timeStr);
  if (!match) return timeStr;
  return `${match[1]}:${match[2]} WIB`;
}

/**
 * Returns the current calendar date (YYYY-MM-DD) in Asia/Jakarta.
 */
export function getJakartaDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Returns tomorrow's calendar date (YYYY-MM-DD) in Asia/Jakarta.
 */
export function getJakartaTomorrowDateString(now: Date = new Date()): string {
  const today = getJakartaDateString(now);
  const [y, m, d] = today.split("-").map(Number);
  const tomorrowUtc = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + 1));
  return tomorrowUtc.toISOString().slice(0, 10);
}

/**
 * Returns the current time (HH:mm) in Asia/Jakarta.
 */
export function getJakartaCurrentTimeString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: JAKARTA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/**
 * Converts a local Asia/Jakarta date (YYYY-MM-DD) and time (HH:mm or HH:mm:ss)
 * to an ISO 8601 UTC string (YYYY-MM-DDTHH:mm:ssZ).
 */
export function jakartaDateTimeToUtcIso(dateStr: string, timeStr: string): string {
  const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const parsed = new Date(`${dateStr}T${normalizedTime}+07:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid Jakarta date/time: ${dateStr} ${timeStr}`);
  }
  return parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}

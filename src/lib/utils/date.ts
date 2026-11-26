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
 * Formats a local time string (HH:mm:ss) as HH:mm WIB.
 */
export function formatLocalTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "-";
  const match = /^(\d{2}):(\d{2})/.exec(timeStr);
  if (!match) return timeStr;
  return `${match[1]}:${match[2]} WIB`;
}

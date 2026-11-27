import { describe, expect, it } from "vitest";
import {
  formatHHmm,
  getBookingTimeBounds,
  minutesToTime,
  toMinutes,
  validateBookingForm,
} from "@/lib/validation/booking";
import type { OperatingHoursSnapshot } from "@/types/domain";

// Fixed reference instant: 2026-11-26 09:30 Asia/Jakarta (02:30:00Z)
const NOW_JAKARTA_0930 = new Date("2026-11-26T02:30:00Z");

const STANDARD_HOURS: OperatingHoursSnapshot = {
  service_date: "2026-11-26",
  timezone: "Asia/Jakarta",
  opens_at: "08:00:00",
  closes_at: "17:00:00",
  early_pickup_allowed_at: "07:45:00",
};

describe("Time conversion helpers", () => {
  it("converts between HH:mm string and total minutes correctly", () => {
    expect(toMinutes("08:30")).toBe(510);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("23:59")).toBe(1439);

    expect(minutesToTime(510)).toBe("08:30");
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(1439)).toBe("23:59");
    expect(formatHHmm("08:30:00")).toBe("08:30");
  });
});

describe("getBookingTimeBounds", () => {
  it("returns tomorrow default bounds starting at 09:00 WIB", () => {
    const bounds = getBookingTimeBounds("2026-11-27", STANDARD_HOURS, NOW_JAKARTA_0930);
    expect(bounds.isToday).toBe(false);
    expect(bounds.isTodayBookable).toBe(true);
    expect(bounds.minStartTime).toBe("08:00");
    expect(bounds.maxStartTime).toBe("16:45");
    expect(bounds.defaultStartTime).toBe("09:00");
    expect(bounds.defaultReturnTime).toBe("11:00");
    expect(bounds.maxReturnTime).toBe("17:00");
    expect(bounds.unavailabilityReason).toBeNull();
  });

  it("handles today before opening hours (e.g. 07:15 WIB)", () => {
    const beforeOpen = new Date("2026-11-26T00:15:00Z"); // 07:15 Jakarta
    const bounds = getBookingTimeBounds("2026-11-26", STANDARD_HOURS, beforeOpen);
    expect(bounds.isToday).toBe(true);
    expect(bounds.isTodayBookable).toBe(true);
    expect(bounds.minStartTime).toBe("08:00");
    expect(bounds.defaultStartTime).toBe("08:00");
    expect(bounds.defaultReturnTime).toBe("10:00");
    expect(bounds.unavailabilityReason).toBeNull();
  });

  it("handles today midday (e.g. 15:12 WIB) with 5-min buffer rounded to next 15 min", () => {
    const midDay = new Date("2026-11-26T08:12:00Z"); // 15:12 Jakarta
    const bounds = getBookingTimeBounds("2026-11-26", STANDARD_HOURS, midDay);
    expect(bounds.isToday).toBe(true);
    expect(bounds.isTodayBookable).toBe(true);
    // 15:12 + 5 min = 15:17 -> rounded up to 15:30
    expect(bounds.defaultStartTime).toBe("15:30");
    // 15:30 + 120 min = 17:30 -> clamped to 17:00
    expect(bounds.defaultReturnTime).toBe("17:00");
    expect(bounds.minStartTime).toBe("15:13");
    expect(bounds.unavailabilityReason).toBeNull();
  });

  it("marks today as unbookable when past closing or less than 15 min before closing", () => {
    const pastClose = new Date("2026-11-26T10:05:00Z"); // 17:05 Jakarta
    const bounds = getBookingTimeBounds("2026-11-26", STANDARD_HOURS, pastClose);
    expect(bounds.isToday).toBe(true);
    expect(bounds.isTodayBookable).toBe(false);
    expect(bounds.unavailabilityReason).toMatch(/telah berakhir/i);

    const nearClose = new Date("2026-11-26T09:48:00Z"); // 16:48 Jakarta (closing is 17:00, threshold is 16:45)
    const boundsNear = getBookingTimeBounds("2026-11-26", STANDARD_HOURS, nearClose);
    expect(boundsNear.isTodayBookable).toBe(false);
    expect(boundsNear.unavailabilityReason).toMatch(/telah berakhir/i);
  });
});

describe("validateBookingForm", () => {
  it("accepts today and tomorrow dates with flexible per-minute times within operating hours", () => {
    const todayResult = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-26",
        startTime: "10:07",
        estimatedReturnTime: "11:23",
      },
      STANDARD_HOURS,
      NOW_JAKARTA_0930
    );
    expect(todayResult).toEqual({});

    const tomorrowResult = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-27",
        startTime: "08:13",
        estimatedReturnTime: "16:30",
      },
      { ...STANDARD_HOURS, service_date: "2026-11-27", closes_at: "16:30:00" },
      NOW_JAKARTA_0930
    );
    expect(tomorrowResult).toEqual({});
  });

  it("rejects dates other than today or tomorrow in Asia/Jakarta", () => {
    const yesterdayErrors = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-25",
        startTime: "10:00",
        estimatedReturnTime: "12:00",
      },
      STANDARD_HOURS,
      NOW_JAKARTA_0930
    );
    expect(yesterdayErrors.bookingDate).toMatch(/hari ini atau besok/i);

    const dayAfterTomorrowErrors = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-28",
        startTime: "10:00",
        estimatedReturnTime: "12:00",
      },
      STANDARD_HOURS,
      NOW_JAKARTA_0930
    );
    expect(dayAfterTomorrowErrors.bookingDate).toMatch(/hari ini atau besok/i);
  });

  it("rejects start times in the past on today's date", () => {
    const errors = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-26",
        startTime: "09:15",
        estimatedReturnTime: "11:00",
      },
      STANDARD_HOURS,
      NOW_JAKARTA_0930
    );
    expect(errors.startTime).toMatch(/masa lalu/i);
  });

  it("rejects today's booking when current time is past operating hours closing", () => {
    const pastClose = new Date("2026-11-26T10:05:00Z"); // 17:05 Jakarta
    const errors = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-26",
        startTime: "15:00",
        estimatedReturnTime: "16:00",
      },
      STANDARD_HOURS,
      pastClose
    );
    expect(errors.bookingDate).toMatch(/telah berakhir/i);
  });

  it("rejects estimated return time not strictly after start time", () => {
    const errors = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-27",
        startTime: "11:00",
        estimatedReturnTime: "10:45",
      },
      STANDARD_HOURS,
      NOW_JAKARTA_0930
    );
    expect(errors.estimatedReturnTime).toMatch(/setelah waktu mulai/i);
  });

  it("enforces dynamic backend operating hours and blocks submission if hours unavailable", () => {
    const customHours: OperatingHoursSnapshot = {
      service_date: "2026-11-27",
      timezone: "Asia/Jakarta",
      opens_at: "08:00:00",
      closes_at: "15:30:00",
      early_pickup_allowed_at: "07:45:00",
    };

    const outsideClose = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-27",
        startTime: "14:00",
        estimatedReturnTime: "16:00",
      },
      customHours,
      NOW_JAKARTA_0930
    );
    expect(outsideClose.estimatedReturnTime).toMatch(/15:30 WIB/);

    const missingHours = validateBookingForm(
      {
        projectorId: "prj_1",
        bookingDate: "2026-11-27",
        startTime: "10:00",
        estimatedReturnTime: "12:00",
      },
      null,
      NOW_JAKARTA_0930
    );
    expect(missingHours.operatingHours).toMatch(/belum tersedia/i);
  });
});

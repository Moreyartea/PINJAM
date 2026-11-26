import { describe, expect, it } from "vitest";
import { validateBookingForm } from "@/lib/validation/booking";
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

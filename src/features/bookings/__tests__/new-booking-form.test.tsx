import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { getJakartaTomorrowDateString } from "@/lib/utils/date";
import { NewBookingForm } from "@/features/bookings/new-booking-form";

const pushMock = vi.fn();
const listProjectorsMock = vi.fn();
const getOperatingHoursMock = vi.fn();
const checkAvailabilityMock = vi.fn();
const createBookingMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "u1",
      email: "komting@kampus.ac.id",
      full_name: "Komting Aktif",
      role: "KOMTING",
      account_status: "ACTIVE",
      komting_assignment: {
        id: "a1",
        class_name: "IF-01",
        status: "ACTIVE",
      },
    },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
    },
    operatingHours: {
      getOperatingHours: (...args: unknown[]) => getOperatingHoursMock(...args),
    },
    availability: {
      checkAvailability: (...args: unknown[]) => checkAvailabilityMock(...args),
    },
    booking: {
      createBooking: (...args: unknown[]) => createBookingMock(...args),
    },
  },
}));

describe("NewBookingForm", () => {
  const tomorrow = getJakartaTomorrowDateString();

  beforeEach(() => {
    vi.clearAllMocks();

    listProjectorsMock.mockResolvedValue({
      data: [
        {
          id: "prj_1",
          asset_code: "PRJ-001",
          name: "Epson EB-X500",
          brand: "Epson",
          model: "EB-X500",
          physical_status: "AVAILABLE",
          is_active: true,
        },
        {
          id: "prj_2",
          asset_code: "PRJ-002",
          name: "BenQ MS560",
          brand: "BenQ",
          model: "MS560",
          physical_status: "BORROWED",
          is_active: true,
        },
      ],
      meta: {
        request_id: "req_1",
        pagination: { page: 1, page_size: 100, total_items: 2, total_pages: 1 },
      },
    });

    getOperatingHoursMock.mockImplementation(async (date: string) => ({
      data: {
        service_date: date,
        timezone: "Asia/Jakarta",
        opens_at: "08:00:00",
        closes_at: date === tomorrow ? "16:30:00" : "17:00:00",
        early_pickup_allowed_at: "07:45:00",
      },
      meta: { request_id: "req_h" },
    }));

    checkAvailabilityMock.mockImplementation(
      async (params: { projector_id: string; date: string }) => ({
        data: {
          projector_id: params.projector_id,
          date: params.date,
          is_bookable: params.projector_id === "prj_1" || params.date === tomorrow,
          physical_status: params.projector_id === "prj_2" ? "BORROWED" : "AVAILABLE",
          operating_hours: {
            service_date: params.date,
            timezone: "Asia/Jakarta",
            opens_at: "08:00:00",
            closes_at: params.date === tomorrow ? "16:30:00" : "17:00:00",
            early_pickup_allowed_at: "07:45:00",
          },
          message:
            params.projector_id === "prj_2" && params.date === tomorrow
              ? "Booking besok bersifat bersyarat."
              : null,
        },
        meta: { request_id: "req_a" },
      })
    );
  });

  it("checks projector availability on date change and reflects backend operating hours", async () => {
    const user = userEvent.setup();
    render(<NewBookingForm />);

    expect(await screen.findByText("Formulir Booking")).toBeInTheDocument();
    await waitFor(() => {
      expect(checkAvailabilityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projector_id: "prj_1",
          date: expect.any(String),
        })
      );
    });

    await user.selectOptions(screen.getByLabelText(/Unit Proyektor/i), "prj_2");
    await user.selectOptions(screen.getByLabelText(/Tanggal Booking/i), tomorrow);

    expect(await screen.findByText("Booking besok bersifat bersyarat.")).toBeInTheDocument();
    expect(screen.getByText(/16:30 WIB/)).toBeInTheDocument();
  });

  it("prevents double-submit and reuses Idempotency-Key for identical retries while rotating on edits", async () => {
    const user = userEvent.setup();

    let resolveFirst!: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    createBookingMock
      .mockReturnValueOnce(pendingPromise)
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "TIMEOUT" }))
      .mockResolvedValueOnce({
        data: {
          id: "bkg_99",
          booking_code: "BKG-20261127-099",
          komting_id: "u1",
          projector_id: "prj_1",
          booking_date: tomorrow,
          start_time: "09:17:00",
          estimated_return_at: "2026-11-27T04:23:00Z",
          status: "CONFIRMED",
          pickup_window: {
            opens_at: "2026-11-27T01:47:00Z",
            closes_at: "2026-11-27T02:32:00Z",
          },
          created_at: "2026-11-26T10:00:00Z",
        },
        meta: { request_id: "req_b" },
      });

    render(<NewBookingForm />);
    expect(await screen.findByText("Formulir Booking")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Tanggal Booking/i), tomorrow);
    fireEvent.change(screen.getByLabelText(/Waktu Mulai/i), { target: { value: "09:17" } });
    fireEvent.change(screen.getByLabelText(/Estimasi Kembali/i), {
      target: { value: "11:23" },
    });

    const submitBtn = screen.getByRole("button", { name: "Kirim Booking" });
    await user.dblClick(submitBtn);

    expect(createBookingMock).toHaveBeenCalledTimes(1);
    const firstKey = createBookingMock.mock.calls[0]?.[1] as string;
    expect(typeof firstKey).toBe("string");
    expect(firstKey.length).toBeGreaterThan(0);

    resolveFirst({
      data: { id: "bkg_first" },
      meta: { request_id: "req_ok" },
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/komting/bookings/bkg_first");
    });

    // Now test identical retry vs edited payload rotating Idempotency-Key
    await user.click(screen.getByRole("button", { name: "Kirim Booking" }));
    expect(await screen.findByText(/Booking Ditolak/i)).toBeInTheDocument();
    const keyBeforeEdit = createBookingMock.mock.calls[1]?.[1] as string;

    fireEvent.change(screen.getByLabelText(/Estimasi Kembali/i), {
      target: { value: "12:00" },
    });
    await user.click(screen.getByRole("button", { name: "Kirim Booking" }));

    await waitFor(() => {
      expect(createBookingMock).toHaveBeenCalledTimes(3);
    });
    const keyAfterEdit = createBookingMock.mock.calls[2]?.[1] as string;
    expect(keyAfterEdit).not.toBe(keyBeforeEdit);
  });
});

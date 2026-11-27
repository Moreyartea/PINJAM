import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { BookingListView } from "@/features/bookings/booking-list-view";

const listKomtingBookingsMock = vi.fn();
const listProjectorsMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    booking: {
      listKomtingBookings: (...args: unknown[]) => listKomtingBookingsMock(...args),
    },
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
    },
  },
}));

describe("BookingListView", () => {
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
      ],
      meta: {
        request_id: "req_p",
        pagination: { page: 1, page_size: 100, total_items: 1, total_pages: 1 },
      },
    });
  });

  it("renders loading state then booking cards with status and pickup window", async () => {
    listKomtingBookingsMock.mockResolvedValueOnce({
      data: [
        {
          id: "bkg_1",
          booking_code: "BKG-20261127-001",
          komting_id: "u1",
          projector_id: "prj_1",
          booking_date: "2026-11-27",
          start_time: "09:00:00",
          estimated_return_at: "2026-11-27T04:00:00Z",
          status: "CONFIRMED",
          pickup_window: {
            opens_at: "2026-11-27T01:30:00Z",
            closes_at: "2026-11-27T02:15:00Z",
          },
          created_at: "2026-11-26T10:00:00Z",
        },
      ],
      meta: {
        request_id: "req_1",
        pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 },
      },
    });

    render(<BookingListView />);

    expect(screen.getAllByText("Memuat Daftar Booking...").length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("BKG-20261127-001")).toBeInTheDocument();
    expect(screen.getByText("Epson EB-X500 (PRJ-001)")).toBeInTheDocument();
    expect(screen.getByText("Terkonfirmasi")).toBeInTheDocument();
    expect(screen.getByText(/08:30 WIB/)).toBeInTheDocument();
  });

  it("renders empty state and triggers status filter", async () => {
    const user = userEvent.setup();
    listKomtingBookingsMock.mockResolvedValue({
      data: [],
      meta: {
        request_id: "req_2",
        pagination: { page: 1, page_size: 10, total_items: 0, total_pages: 0 },
      },
    });

    render(<BookingListView />);
    expect(await screen.findByText("Belum Ada Booking")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter Status Booking"), "CANCELLED");
    await waitFor(() => {
      expect(listKomtingBookingsMock).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        status: "CANCELLED",
      });
    });
  });

  it("renders error state with retry button on failure", async () => {
    listKomtingBookingsMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );

    render(<BookingListView />);
    expect(await screen.findByText("Gagal Memuat Daftar Booking")).toBeInTheDocument();
    expect(screen.getByText("Kode: NETWORK_ERROR")).toBeInTheDocument();
  });
});

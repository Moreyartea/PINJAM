import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffBookingDetailView } from "@/features/staff/staff-booking-detail-view";
import { StaffBookingListView } from "@/features/staff/staff-booking-list-view";

const listStaffBookingsMock = vi.fn();
const getStaffBookingMock = vi.fn();
const listProjectorsMock = vi.fn();
const getProjectorMock = vi.fn();
const validateQrMock = vi.fn();
const confirmPickupMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    booking: {
      listStaffBookings: (...args: unknown[]) => listStaffBookingsMock(...args),
      getStaffBooking: (...args: unknown[]) => getStaffBookingMock(...args),
    },
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
      getProjector: (...args: unknown[]) => getProjectorMock(...args),
    },
    qr: {
      validateQr: (...args: unknown[]) => validateQrMock(...args),
      confirmPickup: (...args: unknown[]) => confirmPickupMock(...args),
    },
  },
}));

describe("Staff Booking Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listProjectorsMock.mockResolvedValue({
      data: [],
      meta: {
        request_id: "req_p",
        pagination: { page: 1, page_size: 100, total_items: 0, total_pages: 0 },
      },
    });
    getProjectorMock.mockResolvedValue({
      data: {
        id: "prj_1",
        asset_code: "PRJ-001",
        name: "Epson EB-X500",
        brand: "Epson",
        model: "EB-X500",
        physical_status: "AVAILABLE",
        is_active: true,
      },
      meta: { request_id: "req_pr" },
    });
  });

  it("renders operational bookings list with projector lookup and filters by status", async () => {
    const user = userEvent.setup();
    listProjectorsMock.mockResolvedValueOnce({
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
    listStaffBookingsMock.mockResolvedValue({
      data: [
        {
          id: "bkg_1",
          booking_code: "BKG-20261126-001",
          komting_id: "u1",
          projector_id: "prj_1",
          booking_date: "2026-11-26",
          start_time: "09:00:00",
          estimated_return_at: "2026-11-26T04:00:00Z",
          status: "CONFIRMED",
          pickup_window: {
            opens_at: "2026-11-26T01:30:00Z",
            closes_at: "2026-11-26T02:15:00Z",
          },
          created_at: "2026-11-26T01:00:00Z",
        },
      ],
      meta: {
        request_id: "req_1",
        pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 },
      },
    });

    render(<StaffBookingListView />);

    expect(await screen.findByText("BKG-20261126-001")).toBeInTheDocument();
    expect(await screen.findByText("Epson EB-X500 (PRJ-001)")).toBeInTheDocument();
    expect(screen.getByText("Komting ID: u1")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter Status"), "FULFILLED");
    await waitFor(() => {
      expect(listStaffBookingsMock).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        status: "FULFILLED",
        date: undefined,
      });
    });
  });

  it("validates QR on booking detail without auto-confirming and requires explicit confirmation", async () => {
    const user = userEvent.setup();
    getStaffBookingMock
      .mockResolvedValueOnce({
        data: {
          id: "bkg_1",
          booking_code: "BKG-20261126-001",
          komting_id: "u1",
          projector_id: "prj_1",
          booking_date: "2026-11-26",
          start_time: "09:00:00",
          estimated_return_at: "2026-11-26T04:00:00Z",
          status: "CONFIRMED",
          pickup_window: {
            opens_at: "2026-11-26T01:30:00Z",
            closes_at: "2026-11-26T02:15:00Z",
          },
          created_at: "2026-11-26T01:00:00Z",
        },
        meta: { request_id: "req_1" },
      })
      .mockResolvedValueOnce({
        data: {
          id: "bkg_1",
          booking_code: "BKG-20261126-001",
          komting_id: "u1",
          projector_id: "prj_1",
          booking_date: "2026-11-26",
          start_time: "09:00:00",
          estimated_return_at: "2026-11-26T04:00:00Z",
          status: "FULFILLED",
          pickup_window: {
            opens_at: "2026-11-26T01:30:00Z",
            closes_at: "2026-11-26T02:15:00Z",
          },
          created_at: "2026-11-26T01:00:00Z",
        },
        meta: { request_id: "req_2" },
      });

    validateQrMock.mockResolvedValueOnce({
      data: {
        valid: true,
        action: "PICKUP",
        transaction: {
          booking_id: "bkg_1",
          booking_code: "BKG-20261126-001",
          komting_name: "Budi",
          class_name: "IF-01",
          projector_name: "Epson EB-X500",
          status: "CONFIRMED",
        },
        requires_confirmation: true,
      },
      meta: { request_id: "req_v" },
    });

    confirmPickupMock.mockResolvedValueOnce({
      data: {
        booking: { id: "bkg_1", status: "FULFILLED" },
        loan: { id: "loan_9", status: "ACTIVE", picked_up_at: "2026-11-26T02:00:00Z" },
        projector: { id: "prj_1", physical_status: "BORROWED" },
      },
      meta: { request_id: "req_c" },
    });

    render(<StaffBookingDetailView bookingId="bkg_1" />);

    await user.type(await screen.findByLabelText(/Token QR Booking/i), "opaque_qr_tok");
    await user.click(screen.getByRole("button", { name: "Validasi QR" }));

    expect(await screen.findByText(/QR Valid — Siap Konfirmasi/i)).toBeInTheDocument();
    // Scan alone must NOT call confirmPickup
    expect(confirmPickupMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));
    await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

    await waitFor(() => {
      expect(confirmPickupMock).toHaveBeenCalledWith(
        "bkg_1",
        {
          qr_payload: "opaque_qr_tok",
          confirmed: true,
          received_by: "KOMTING",
          representative_name: null,
          note: null,
        },
        expect.any(String)
      );
    });
  });

  it("searches booking by database ID via getStaffBooking API and handles 404 cleanly", async () => {
    const user = userEvent.setup();
    listStaffBookingsMock.mockResolvedValueOnce({
      data: [],
      meta: {
        request_id: "req_empty",
        pagination: { page: 1, page_size: 10, total_items: 0, total_pages: 0 },
      },
    });

    getStaffBookingMock.mockResolvedValueOnce({
      data: {
        id: "bkg_lookup_id",
        booking_code: "BKG-20261127-888",
        komting_id: "u2",
        projector_id: "prj_1",
        booking_date: "2026-11-27",
        start_time: "10:00:00",
        estimated_return_at: "2026-11-27T06:00:00Z",
        status: "CONFIRMED",
        pickup_window: {
          opens_at: "2026-11-27T02:30:00Z",
          closes_at: "2026-11-27T03:15:00Z",
        },
        created_at: "2026-11-27T02:00:00Z",
      },
      meta: { request_id: "req_lookup" },
    });

    render(<StaffBookingListView />);

    const searchInput = screen.getByLabelText(/Identifier Booking/i);
    await user.type(searchInput, "bkg_lookup_id");
    await user.click(screen.getByRole("button", { name: "Cari Booking" }));

    expect(getStaffBookingMock).toHaveBeenCalledWith("bkg_lookup_id");
    expect(await screen.findByText("ID: bkg_lookup_id")).toBeInTheDocument();
    expect(screen.getByText("BKG-20261127-888")).toBeInTheDocument();
    expect(screen.getByText("Lihat Detail & Proses Booking")).toBeInTheDocument();

    // Reset search
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByText("ID: bkg_lookup_id")).not.toBeInTheDocument();
  });

  it("searches booking by booking code in loaded list or shows Contract Gap notice if not loaded", async () => {
    const user = userEvent.setup();
    listStaffBookingsMock.mockResolvedValueOnce({
      data: [
        {
          id: "bkg_in_list",
          booking_code: "BKG-LOADED-01",
          komting_id: "u3",
          projector_id: "prj_1",
          booking_date: "2026-11-27",
          start_time: "13:00:00",
          estimated_return_at: "2026-11-27T08:00:00Z",
          status: "CONFIRMED",
          pickup_window: {
            opens_at: "2026-11-27T05:30:00Z",
            closes_at: "2026-11-27T06:15:00Z",
          },
          created_at: "2026-11-27T05:00:00Z",
        },
      ],
      meta: {
        request_id: "req_loaded",
        pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 },
      },
    });

    render(<StaffBookingListView />);
    expect(await screen.findByText("BKG-LOADED-01")).toBeInTheDocument();

    const searchInput = screen.getByLabelText(/Identifier Booking/i);

    // 1. Matched in loaded list
    await user.type(searchInput, "BKG-LOADED-01");
    await user.click(screen.getByRole("button", { name: "Cari Booking" }));
    expect(await screen.findByText("ID: bkg_in_list")).toBeInTheDocument();
    expect(screen.getByText("Lihat Detail & Proses Booking")).toBeInTheDocument();

    // 2. Not found in loaded list -> Contract gap notice
    await user.clear(searchInput);
    await user.type(searchInput, "BKG-NOT-LOADED-99");
    await user.click(screen.getByRole("button", { name: "Cari Booking" }));

    expect(
      await screen.findByText(/tidak ditemukan pada daftar aktif yang dimuat/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Contract Gap untuk pencarian kode server-side/i)).toBeInTheDocument();
  });
});

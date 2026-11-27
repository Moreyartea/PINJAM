import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { BookingDetailView } from "@/features/bookings/booking-detail-view";

const getKomtingBookingMock = vi.fn();
const cancelKomtingBookingMock = vi.fn();
const getProjectorMock = vi.fn();
const getBookingQrMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    booking: {
      getKomtingBooking: (...args: unknown[]) => getKomtingBookingMock(...args),
      cancelKomtingBooking: (...args: unknown[]) => cancelKomtingBookingMock(...args),
    },
    projector: {
      getProjector: (...args: unknown[]) => getProjectorMock(...args),
    },
    qr: {
      getBookingQr: (...args: unknown[]) => getBookingQrMock(...args),
    },
  },
}));

describe("BookingDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      meta: { request_id: "req_p" },
    });
  });

  it("displays booking detail, pickup window, and opaque QR token", async () => {
    getKomtingBookingMock.mockResolvedValueOnce({
      data: {
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
      meta: { request_id: "req_1" },
    });

    getBookingQrMock.mockResolvedValueOnce({
      data: {
        qr_payload: "opaque_random_token_abc123",
        expires_at: "2026-11-27T02:15:00Z",
      },
      meta: { request_id: "req_qr" },
    });

    render(<BookingDetailView bookingId="bkg_1" />);

    expect(await screen.findByText("Booking BKG-20261127-001")).toBeInTheDocument();
    expect(await screen.findByText("opaque_random_token_abc123")).toBeInTheDocument();
    expect(
      await screen.findByLabelText("QR code untuk booking BKG-20261127-001")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/baru sah setelah dipindai dan dikonfirmasi langsung oleh STAFF\/ADMIN/i)
    ).toBeInTheDocument();
  });

  it("handles booking cancellation confirmation, validation, and backend rejection", async () => {
    const user = userEvent.setup();
    getKomtingBookingMock
      .mockResolvedValueOnce({
        data: {
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
        meta: { request_id: "req_1" },
      })
      .mockResolvedValueOnce({
        data: {
          id: "bkg_1",
          booking_code: "BKG-20261127-001",
          komting_id: "u1",
          projector_id: "prj_1",
          booking_date: "2026-11-27",
          start_time: "09:00:00",
          estimated_return_at: "2026-11-27T04:00:00Z",
          status: "CANCELLED",
          pickup_window: {
            opens_at: "2026-11-27T01:30:00Z",
            closes_at: "2026-11-27T02:15:00Z",
          },
          created_at: "2026-11-26T10:00:00Z",
        },
        meta: { request_id: "req_2" },
      });

    getBookingQrMock.mockResolvedValueOnce({
      data: {
        qr_payload: "opaque_token_xyz",
        expires_at: "2026-11-27T02:15:00Z",
      },
      meta: { request_id: "req_qr" },
    });

    cancelKomtingBookingMock
      .mockRejectedValueOnce(new ApiClientError({ status: 409, code: "BOOKING_EXPIRED" }))
      .mockResolvedValueOnce({ data: { status: "CANCELLED" }, meta: { request_id: "req_c" } });

    render(<BookingDetailView bookingId="bkg_1" />);

    await user.click(await screen.findByRole("button", { name: "Batalkan Booking" }));
    await user.click(screen.getByRole("button", { name: "Ya, Batalkan Booking" }));

    expect(screen.getByText("Alasan pembatalan wajib diisi.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Alasan Pembatalan/i), "Kelas dibatalkan.");
    await user.click(screen.getByRole("button", { name: "Ya, Batalkan Booking" }));

    expect(await screen.findByText(/Pembatalan Ditolak/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya, Batalkan Booking" }));

    await waitFor(() => {
      expect(screen.getByText("Booking berhasil dibatalkan.")).toBeInTheDocument();
    });
    expect(await screen.findByText("Dibatalkan")).toBeInTheDocument();
  });

  it("does not fetch pickup QR and displays loan redirect card when booking is FULFILLED", async () => {
    getKomtingBookingMock.mockResolvedValueOnce({
      data: {
        id: "bkg_fulfilled_1",
        booking_code: "BKG-20261127-888",
        komting_id: "u1",
        projector_id: "prj_1",
        booking_date: "2026-11-27",
        start_time: "09:00:00",
        estimated_return_at: "2026-11-27T04:00:00Z",
        status: "FULFILLED",
        pickup_window: {
          opens_at: "2026-11-27T01:30:00Z",
          closes_at: "2026-11-27T02:15:00Z",
        },
        created_at: "2026-11-26T10:00:00Z",
      },
      meta: { request_id: "req_fulfilled" },
    });

    render(<BookingDetailView bookingId="bkg_fulfilled_1" />);

    expect(await screen.findByText("Booking BKG-20261127-888")).toBeInTheDocument();
    expect(screen.getByText("Pickup Selesai")).toBeInTheDocument();
    expect(screen.getByText("Unit Sedang Dalam Peminjaman")).toBeInTheDocument();
    expect(
      screen.getByText(/Tiket QR pickup untuk booking ini telah berhasil diproses/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Buka Riwayat Peminjaman & Ajukan Return/i })
    ).toBeInTheDocument();

    // Verify pickup QR was NOT fetched
    expect(getBookingQrMock).not.toHaveBeenCalled();
  });
});

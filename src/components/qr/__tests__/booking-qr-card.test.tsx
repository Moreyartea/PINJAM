import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookingQrCard } from "@/components/qr/booking-qr-card";

describe("BookingQrCard", () => {
  it("renders fallback warning when QR payload is not yet available from server", () => {
    render(
      <BookingQrCard
        bookingCode="BKG-20261127-001"
        bookingStatus="CONFIRMED"
        qrPayload={null}
        expiresAt={null}
        loading={false}
      />
    );

    expect(screen.getByText("QR Belum Tersedia")).toBeInTheDocument();
    expect(screen.getByText(/Token QR belum diterbitkan oleh server/i)).toBeInTheDocument();
  });

  it("renders opaque QR token when payload is provided by backend without storing in localStorage", async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

    render(
      <BookingQrCard
        bookingCode="BKG-20261127-001"
        bookingStatus="CONFIRMED"
        qrPayload="opaque_server_token_12345"
        expiresAt="2026-11-27T02:15:00Z"
        loading={false}
      />
    );

    expect(await screen.findByText("opaque_server_token_12345")).toBeInTheDocument();
    expect(screen.getByLabelText("QR code untuk booking BKG-20261127-001")).toBeInTheDocument();
    expect(localStorageSpy).not.toHaveBeenCalled();

    localStorageSpy.mockRestore();
  });

  it("renders loading state while QR token is being fetched from server", () => {
    render(
      <BookingQrCard
        bookingCode="BKG-20261127-001"
        bookingStatus="CONFIRMED"
        qrPayload={null}
        expiresAt={null}
        loading={true}
      />
    );

    expect(screen.getByText("Mengambil token QR dari server...")).toBeInTheDocument();
  });

  it("renders error state when QR fetch fails and triggers refresh", async () => {
    const user = userEvent.setup();
    const refreshMock = vi.fn();

    render(
      <BookingQrCard
        bookingCode="BKG-20261127-001"
        bookingStatus="CONFIRMED"
        qrPayload={null}
        expiresAt={null}
        loading={false}
        errorMessage="Gagal memuat QR dari backend."
        onRefreshQr={refreshMock}
      />
    );

    expect(screen.getByText("QR Belum Dapat Ditampilkan")).toBeInTheDocument();
    expect(screen.getByText("Gagal memuat QR dari backend.")).toBeInTheDocument();

    const refreshBtn = screen.getByRole("button", { name: /Muat Ulang QR/i });
    await user.click(refreshBtn);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("renders inactive alert when booking status is not eligible for QR", () => {
    render(
      <BookingQrCard
        bookingCode="BKG-20261127-001"
        bookingStatus="CANCELLED"
        qrPayload={null}
        expiresAt={null}
        loading={false}
      />
    );

    expect(screen.getByText("QR Tidak Aktif")).toBeInTheDocument();
    expect(screen.getByText(/CANCELLED/)).toBeInTheDocument();
  });
});

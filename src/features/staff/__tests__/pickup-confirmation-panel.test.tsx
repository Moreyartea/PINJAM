import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PickupConfirmationPanel } from "@/features/staff/pickup-confirmation-panel";
import { ApiClientError } from "@/lib/api/errors";
import type { QrValidationResponse } from "@/services/contracts";

const confirmPickupMock = vi.fn();

vi.mock("@/services", () => ({
  services: {
    qr: {
      confirmPickup: (...args: unknown[]) => confirmPickupMock(...args),
    },
  },
}));

const VALID_PICKUP_DATA: QrValidationResponse = {
  valid: true,
  action: "PICKUP",
  transaction: {
    booking_id: "bkg_panel_01",
    booking_code: "BKG-20261127-P01",
    komting_name: "Farhan Hakim",
    class_name: "IF-3A",
    projector_name: "Epson EB-X500",
    status: "CONFIRMED",
  },
  requires_confirmation: true,
};

describe("PickupConfirmationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires representative name when REPRESENTATIVE is chosen, and submits pickup explicitly", async () => {
    const user = userEvent.setup();
    const onConfirmedSpy = vi.fn();

    confirmPickupMock.mockResolvedValueOnce({
      data: {
        booking: { id: "bkg_panel_01", status: "FULFILLED" },
        loan: {
          id: "loan_panel_01",
          status: "ACTIVE",
          picked_up_at: "2026-11-27T02:00:00Z",
        },
        projector: { id: "prj_001", physical_status: "BORROWED" },
      },
      meta: { request_id: "req_p_panel" },
    });

    render(
      <PickupConfirmationPanel
        validation={VALID_PICKUP_DATA}
        qrPayload="opaque_token_panel_01"
        onConfirmed={onConfirmedSpy}
      />
    );

    // Initial state check
    expect(screen.getByText("Farhan Hakim")).toBeInTheDocument();
    expect(screen.getByText("IF-3A")).toBeInTheDocument();

    // Select REPRESENTATIVE
    await user.selectOptions(screen.getByLabelText(/Penerima Unit/i), "REPRESENTATIVE");

    // Click without typing representative name
    await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));
    expect(
      screen.getByText("Nama perwakilan wajib diisi jika bukan diambil komting.")
    ).toBeInTheDocument();
    expect(confirmPickupMock).not.toHaveBeenCalled();

    // Fill representative name and note
    await user.type(screen.getByLabelText(/Nama Perwakilan Penerima/i), "Gilang Dirga");
    await user.type(screen.getByLabelText(/Catatan Operasional/i), "Diserahkan dengan kabel HDMI");

    await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));

    // Confirm dialog appears
    expect(screen.getByText("Konfirmasi Penyerahan Proyektor?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

    await waitFor(() => {
      expect(confirmPickupMock).toHaveBeenCalledTimes(1);
    });

    expect(confirmPickupMock).toHaveBeenCalledWith(
      "bkg_panel_01",
      {
        qr_payload: "opaque_token_panel_01",
        confirmed: true,
        received_by: "REPRESENTATIVE",
        representative_name: "Gilang Dirga",
        note: "Diserahkan dengan kabel HDMI",
      },
      expect.any(String)
    );

    expect(onConfirmedSpy).toHaveBeenCalledWith({
      booking: { id: "bkg_panel_01", status: "FULFILLED" },
      loan: {
        id: "loan_panel_01",
        status: "ACTIVE",
        picked_up_at: "2026-11-27T02:00:00Z",
      },
      projector: { id: "prj_001", physical_status: "BORROWED" },
    });

    // Success card is rendered with navigation links
    expect(await screen.findByText("Serah-Terima Unit Berhasil")).toBeInTheDocument();
    const loanLink = screen.getByRole("link", { name: "Buka Detail Loan Baru" });
    expect(loanLink).toHaveAttribute("href", "/staff/loans/loan_panel_01");

    const bkgLink = screen.getByRole("link", { name: "Lihat Detail Booking" });
    expect(bkgLink).toHaveAttribute("href", "/staff/bookings/bkg_panel_01");
  });

  it("handles backend conflict error (409) and safely allows retry with same Idempotency-Key", async () => {
    const user = userEvent.setup();

    confirmPickupMock
      .mockRejectedValueOnce(
        new ApiClientError({
          status: 409,
          code: "BOOKING_NOT_PICKUP_ELIGIBLE",
          message: "Jendela pickup telah ditutup (window expired).",
        })
      )
      .mockResolvedValueOnce({
        data: {
          booking: { id: "bkg_panel_01", status: "FULFILLED" },
          loan: {
            id: "loan_panel_01",
            status: "ACTIVE",
            picked_up_at: "2026-11-27T02:00:00Z",
          },
          projector: { id: "prj_001", physical_status: "BORROWED" },
        },
        meta: { request_id: "req_retry_ok" },
      });

    render(
      <PickupConfirmationPanel validation={VALID_PICKUP_DATA} qrPayload="opaque_token_panel_01" />
    );

    await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));
    await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

    expect(
      (await screen.findAllByText(/jendela waktu pengambilan/i)).length
    ).toBeGreaterThanOrEqual(1);
    expect(confirmPickupMock).toHaveBeenCalledTimes(1);
    const firstKey = confirmPickupMock.mock.calls[0]?.[2] as string;

    // Retry identical submission
    await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

    await waitFor(() => {
      expect(confirmPickupMock).toHaveBeenCalledTimes(2);
    });
    const secondKey = confirmPickupMock.mock.calls[1]?.[2] as string;
    expect(secondKey).toBe(firstKey);

    expect(await screen.findByText("Serah-Terima Unit Berhasil")).toBeInTheDocument();
  });
});

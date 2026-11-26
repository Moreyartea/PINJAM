import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { StaffQrScanView } from "@/features/staff/staff-qr-scan-view";

const validateQrMock = vi.fn();
const confirmPickupMock = vi.fn();
const listStaffLoansMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    qr: {
      validateQr: (...args: unknown[]) => validateQrMock(...args),
      confirmPickup: (...args: unknown[]) => confirmPickupMock(...args),
    },
    loan: {
      listStaffLoans: (...args: unknown[]) => listStaffLoansMock(...args),
    },
  },
}));

describe("StaffQrScanView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks up PICKUP QR, requires representative name when selected, and reuses Idempotency-Key on retry", async () => {
    const user = userEvent.setup();
    validateQrMock.mockResolvedValueOnce({
      data: {
        valid: true,
        action: "PICKUP",
        transaction: {
          booking_id: "bkg_1",
          booking_code: "BKG-001",
          komting_name: "Budi",
          class_name: "IF-01",
          projector_name: "Epson EB-X500",
          status: "CONFIRMED",
        },
        requires_confirmation: true,
      },
      meta: { request_id: "req_v" },
    });

    confirmPickupMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "TIMEOUT" }))
      .mockResolvedValueOnce({
        data: {
          booking: { id: "bkg_1", status: "FULFILLED" },
          loan: { id: "loan_1", status: "ACTIVE", picked_up_at: "2026-11-26T02:00:00Z" },
          projector: { id: "prj_1", physical_status: "BORROWED" },
        },
        meta: { request_id: "req_p" },
      });

    render(<StaffQrScanView />);

    await user.type(screen.getByLabelText(/Token QR/i), "opaque_pickup_1");
    await user.click(screen.getByRole("button", { name: "Validasi Token QR" }));

    expect(await screen.findByText(/BKG-001 — Epson EB-X500/i)).toBeInTheDocument();
    expect(confirmPickupMock).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText(/Penerima Unit/i), "REPRESENTATIVE");
    await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));
    expect(
      screen.getByText("Nama perwakilan wajib diisi jika bukan diambil komting.")
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Nama Perwakilan Penerima/i), "Andi Wakil");
    await user.click(screen.getByRole("button", { name: "Konfirmasi Pickup" }));
    await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

    expect(await screen.findByText(/Gagal Mengirim Konfirmasi/i)).toBeInTheDocument();
    const firstKey = confirmPickupMock.mock.calls[0]?.[2] as string;

    // Retry identical payload reuses same Idempotency-Key
    await user.click(screen.getByRole("button", { name: "Ya, Konfirmasi Pickup" }));

    await waitFor(() => {
      expect(confirmPickupMock).toHaveBeenCalledTimes(2);
    });
    expect(confirmPickupMock.mock.calls[1]?.[2]).toBe(firstKey);
    expect(await screen.findByText("Serah-Terima Unit Berhasil")).toBeInTheDocument();
  });

  it("resolves active loan from /staff/loans?status=ACTIVE when validating RETURN QR", async () => {
    const user = userEvent.setup();
    validateQrMock.mockResolvedValueOnce({
      data: {
        valid: true,
        action: "RETURN",
        transaction: {
          booking_id: "bkg_1",
          booking_code: "BKG-001",
          komting_name: "Budi",
          class_name: "IF-01",
          projector_name: "Epson EB-X500",
          status: "ACTIVE",
        },
        requires_confirmation: true,
      },
      meta: { request_id: "req_r" },
    });

    listStaffLoansMock.mockResolvedValueOnce({
      data: [
        {
          id: "loan_active_1",
          booking_id: "bkg_1",
          projector_id: "prj_1",
          komting_id: "u1",
          status: "ACTIVE",
          picked_up_at: "2026-11-26T02:00:00Z",
          returned_at: null,
          return_condition: null,
        },
      ],
      meta: {
        request_id: "req_l",
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });

    render(<StaffQrScanView />);

    await user.click(screen.getByRole("button", { name: "RETURN (Pengembalian)" }));
    await user.type(screen.getByLabelText(/Token QR/i), "opaque_return_1");
    await user.click(screen.getByRole("button", { name: "Validasi Token QR" }));

    expect(
      await screen.findByText(/Form Inspeksi Pengembalian — Epson EB-X500/i)
    ).toBeInTheDocument();
    expect(listStaffLoansMock).toHaveBeenCalledWith({
      status: "ACTIVE",
      page: 1,
      page_size: 20,
    });
  });
});

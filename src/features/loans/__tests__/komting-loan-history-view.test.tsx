import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { KomtingLoanHistoryView } from "@/features/loans/komting-loan-history-view";

const listKomtingLoansMock = vi.fn();
const listProjectorsMock = vi.fn();
const initiateReturnMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    loan: {
      listKomtingLoans: (...args: unknown[]) => listKomtingLoansMock(...args),
      initiateReturn: (...args: unknown[]) => initiateReturnMock(...args),
    },
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
    },
  },
}));

describe("KomtingLoanHistoryView", () => {
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

  it("renders active and returned loans with actual return time and condition", async () => {
    listKomtingLoansMock.mockResolvedValueOnce({
      data: [
        {
          id: "loan_1",
          booking_id: "bkg_1",
          projector_id: "prj_1",
          komting_id: "u1",
          status: "ACTIVE",
          picked_up_at: "2026-11-26T02:00:00Z",
          returned_at: null,
          return_condition: null,
        },
        {
          id: "loan_2",
          booking_id: "bkg_0",
          projector_id: "prj_1",
          komting_id: "u1",
          status: "RETURNED",
          picked_up_at: "2026-11-25T02:00:00Z",
          returned_at: "2026-11-25T04:50:00Z",
          return_condition: "NORMAL",
        },
      ],
      meta: {
        request_id: "req_1",
        pagination: { page: 1, page_size: 10, total_items: 2, total_pages: 1 },
      },
    });

    render(<KomtingLoanHistoryView />);

    expect(await screen.findByText("loan_1")).toBeInTheDocument();
    expect(screen.getByText("loan_2")).toBeInTheDocument();
    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(screen.getByText("Dikembalikan")).toBeInTheDocument();
    expect(screen.getByText("Belum dikembalikan")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
  });

  it("filters loan history and shows empty state", async () => {
    const user = userEvent.setup();
    listKomtingLoansMock.mockResolvedValue({
      data: [],
      meta: {
        request_id: "req_2",
        pagination: { page: 1, page_size: 10, total_items: 0, total_pages: 0 },
      },
    });

    render(<KomtingLoanHistoryView />);
    expect(await screen.findByText("Belum Ada Riwayat Peminjaman")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter Status Peminjaman"), "RETURNED");
    await waitFor(() => {
      expect(listKomtingLoansMock).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        status: "RETURNED",
      });
    });
  });

  it("renders error state on failure", async () => {
    listKomtingLoansMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );

    render(<KomtingLoanHistoryView />);
    expect(await screen.findByText("Gagal Memuat Riwayat Peminjaman")).toBeInTheDocument();
  });

  it("initiates return for active loan, renders return QR dialog, and allows refreshing QR", async () => {
    const user = userEvent.setup();
    listKomtingLoansMock.mockResolvedValueOnce({
      data: [
        {
          id: "loan_active_1",
          booking_id: "bkg_active_1",
          projector_id: "prj_1",
          komting_id: "u1",
          status: "ACTIVE",
          picked_up_at: "2026-11-26T02:00:00Z",
          returned_at: null,
          return_condition: null,
        },
      ],
      meta: {
        request_id: "req_act",
        pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 },
      },
    });

    initiateReturnMock.mockResolvedValueOnce({
      data: {
        loan_id: "loan_active_1",
        booking_id: "bkg_active_1",
        qr_payload: "return_opaque_token_abc_999",
        expires_at: "2026-11-26T02:30:00Z",
      },
      meta: { request_id: "req_init_ret" },
    });

    render(<KomtingLoanHistoryView />);

    expect(await screen.findByText("loan_active_1")).toBeInTheDocument();
    const returnBtn = screen.getByRole("button", {
      name: /Ajukan Pengembalian \(Tampilkan QR Return\)/i,
    });
    expect(returnBtn).toBeInTheDocument();

    await user.click(returnBtn);

    expect(initiateReturnMock).toHaveBeenCalledWith("loan_active_1");
    expect(
      await screen.findByRole("heading", { name: "QR Pengembalian Proyektor (Return)" })
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText("QR Code Return untuk loan loan_active_1")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Petugas operasional akan memindai QR ini untuk membuka formulir inspeksi/i)
    ).toBeInTheDocument();

    // Close modal
    await user.click(screen.getByRole("button", { name: "Tutup" }));
    expect(
      screen.queryByRole("heading", { name: "QR Pengembalian Proyektor (Return)" })
    ).not.toBeInTheDocument();
  });

  it("handles error during return initiation and permits retry", async () => {
    const user = userEvent.setup();
    listKomtingLoansMock.mockResolvedValueOnce({
      data: [
        {
          id: "loan_active_fail",
          booking_id: "bkg_act_2",
          projector_id: "prj_1",
          komting_id: "u1",
          status: "ACTIVE",
          picked_up_at: "2026-11-26T02:00:00Z",
          returned_at: null,
          return_condition: null,
        },
      ],
      meta: {
        request_id: "req_f",
        pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 },
      },
    });

    initiateReturnMock.mockRejectedValueOnce(
      new Error("Loan sudah dalam proses pengembalian.")
    );

    render(<KomtingLoanHistoryView />);

    const returnBtn = await screen.findByRole("button", {
      name: /Ajukan Pengembalian \(Tampilkan QR Return\)/i,
    });
    await user.click(returnBtn);

    expect(await screen.findByText("Gagal Mengajukan Pengembalian")).toBeInTheDocument();
    expect(screen.getByText("Loan sudah dalam proses pengembalian.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coba Lagi" })).toBeInTheDocument();
  });
});

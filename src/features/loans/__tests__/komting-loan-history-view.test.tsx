import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { KomtingLoanHistoryView } from "@/features/loans/komting-loan-history-view";

const listKomtingLoansMock = vi.fn();
const listProjectorsMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    loan: {
      listKomtingLoans: (...args: unknown[]) => listKomtingLoansMock(...args),
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
});

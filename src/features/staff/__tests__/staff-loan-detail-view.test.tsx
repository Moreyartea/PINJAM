import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffLoanDetailView } from "@/features/staff/staff-loan-detail-view";
import { StaffLoanListView } from "@/features/staff/staff-loan-list-view";
import { ApiClientError } from "@/lib/api/errors";

const getStaffLoanMock = vi.fn();
const listStaffLoansMock = vi.fn();
const getProjectorMock = vi.fn();
const getStaffBookingMock = vi.fn();
const listProjectorsMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    loan: {
      getStaffLoan: (...args: unknown[]) => getStaffLoanMock(...args),
      listStaffLoans: (...args: unknown[]) => listStaffLoansMock(...args),
    },
    projector: {
      getProjector: (...args: unknown[]) => getProjectorMock(...args),
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
    },
    booking: {
      getStaffBooking: (...args: unknown[]) => getStaffBookingMock(...args),
    },
  },
}));

describe("Staff Loan Views (List & Detail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listProjectorsMock.mockResolvedValue({
      data: [
        {
          id: "prj_001",
          asset_code: "PRJ-001",
          name: "Epson EB-X500",
          brand: "Epson",
          model: "EB-X500",
          physical_status: "BORROWED",
          is_active: true,
        },
      ],
      meta: {
        request_id: "req_p",
        pagination: { page: 1, page_size: 100, total_items: 1, total_pages: 1 },
      },
    });

    getProjectorMock.mockResolvedValue({
      data: {
        id: "prj_001",
        asset_code: "PRJ-001",
        name: "Epson EB-X500",
        brand: "Epson",
        model: "EB-X500",
        physical_status: "BORROWED",
        is_active: true,
      },
      meta: { request_id: "req_pr" },
    });

    getStaffBookingMock.mockResolvedValue({
      data: {
        id: "bkg_001",
        booking_code: "BKG-20261127-001",
        komting_id: "usr_komting_1",
        projector_id: "prj_001",
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
      meta: { request_id: "req_bk" },
    });
  });

  describe("StaffLoanDetailView", () => {
    it("renders active loan details, related booking link, and return inspection action", async () => {
      getStaffLoanMock.mockResolvedValueOnce({
        data: {
          id: "loan_active_99",
          booking_id: "bkg_001",
          projector_id: "prj_001",
          komting_id: "usr_komting_1",
          status: "ACTIVE",
          picked_up_at: "2026-11-27T02:00:00Z",
          returned_at: null,
          return_condition: null,
        },
        meta: { request_id: "req_loan_active" },
      });

      render(<StaffLoanDetailView loanId="loan_active_99" />);

      expect(await screen.findByText(/Detail Loan: loan_active_99/i)).toBeInTheDocument();
      expect((await screen.findAllByText("Epson EB-X500 (PRJ-001)")).length).toBeGreaterThanOrEqual(
        1
      );
      expect(screen.getByText("BKG-20261127-001")).toBeInTheDocument();
      expect(screen.getByText("Belum Dikembalikan")).toBeInTheDocument();

      const returnLink = screen.getByRole("link", { name: "Proses Inspeksi Return" });
      expect(returnLink).toHaveAttribute("href", "/staff/loans/loan_active_99/return");
    });

    it("renders returned loan details with actual return time and return condition", async () => {
      getStaffLoanMock.mockResolvedValueOnce({
        data: {
          id: "loan_returned_99",
          booking_id: "bkg_001",
          projector_id: "prj_001",
          komting_id: "usr_komting_1",
          status: "RETURNED",
          picked_up_at: "2026-11-27T02:00:00Z",
          returned_at: "2026-11-27T05:00:00Z",
          return_condition: "NORMAL",
        },
        meta: { request_id: "req_loan_ret" },
      });

      render(<StaffLoanDetailView loanId="loan_returned_99" />);

      expect(await screen.findByText(/Detail Loan: loan_returned_99/i)).toBeInTheDocument();
      expect(screen.getByText("Peminjaman Selesai")).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Proses Inspeksi Return" })
      ).not.toBeInTheDocument();
    });

    it("handles 404 loan not found with informative error state and retry", async () => {
      const user = userEvent.setup();
      getStaffLoanMock.mockRejectedValueOnce(
        new ApiClientError({
          status: 404,
          code: "LOAN_NOT_FOUND",
          message: "Data peminjaman tidak ditemukan di server.",
        })
      );

      render(<StaffLoanDetailView loanId="loan_not_exist" />);

      expect(await screen.findByText("Data Loan Tidak Ditemukan")).toBeInTheDocument();
      expect(screen.getByText(/Data peminjaman tidak ditemukan di server/i)).toBeInTheDocument();

      // Retry
      getStaffLoanMock.mockResolvedValueOnce({
        data: {
          id: "loan_not_exist",
          booking_id: "bkg_001",
          projector_id: "prj_001",
          komting_id: "usr_komting_1",
          status: "ACTIVE",
          picked_up_at: "2026-11-27T02:00:00Z",
          returned_at: null,
          return_condition: null,
        },
        meta: { request_id: "req_retry_ok" },
      });

      await user.click(screen.getByRole("button", { name: "Coba Lagi" }));
      expect(await screen.findByText(/Detail Loan: loan_not_exist/i)).toBeInTheDocument();
    });
  });

  describe("StaffLoanListView", () => {
    it("renders loan items with direct link to loan detail and inspection", async () => {
      listStaffLoansMock.mockResolvedValueOnce({
        data: [
          {
            id: "loan_card_01",
            booking_id: "bkg_001",
            projector_id: "prj_001",
            komting_id: "usr_komting_1",
            status: "ACTIVE",
            picked_up_at: "2026-11-27T02:00:00Z",
            returned_at: null,
            return_condition: null,
          },
        ],
        meta: {
          request_id: "req_list_staff",
          pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 },
        },
      });

      render(<StaffLoanListView />);

      expect(await screen.findByText("loan_card_01")).toBeInTheDocument();
      const detailLink = screen.getByRole("link", { name: "Detail Loan" });
      expect(detailLink).toHaveAttribute("href", "/staff/loans/loan_card_01");

      const returnLink = screen.getByRole("link", { name: "Proses Inspeksi Return" });
      expect(returnLink).toHaveAttribute("href", "/staff/loans/loan_card_01/return");
    });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KomtingDashboardView } from "@/features/komting/komting-dashboard-view";
import { ApiClientError } from "@/lib/api/errors";
import type { KomtingDashboardSummary } from "@/types/domain";

const getKomtingDashboardMock = vi.fn();

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "komting_1",
      email: "komting@example.test",
      full_name: "Budi Santoso",
      role: "KOMTING",
      account_status: "ACTIVE",
      komting_assignment: {
        id: "assign_1",
        class_name: "IF-TEST-02",
        academic_year: "2026/2027",
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
  isMockMode: false,
  services: {
    admin: {
      getKomtingDashboard: (...args: unknown[]) => getKomtingDashboardMock(...args),
    },
  },
}));

describe("KomtingDashboardView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading state initially", () => {
    getKomtingDashboardMock.mockReturnValue(new Promise(() => undefined));

    render(<KomtingDashboardView />);

    expect(screen.getAllByText("Memuat Dashboard Komting...")[0]).toBeInTheDocument();
  });

  it("renders full dashboard data when API succeeds", async () => {
    const mockSummary: KomtingDashboardSummary = {
      active_assignment: {
        id: "asg_1",
        class_name: "IF-TEST-02",
        status: "ACTIVE",
      },
      active_booking: {
        id: "bkg_1",
        booking_code: "BKG-CONC-2",
        komting_id: "komting_1",
        projector_id: "prj_1",
        booking_date: "2026-11-27",
        start_time: "10:00:00",
        estimated_return_at: "2026-11-27T05:00:00Z",
        status: "CONFIRMED",
        pickup_window: {
          opens_at: "2026-11-27T02:30:00Z",
          closes_at: "2026-11-27T03:15:00Z",
        },
        created_at: "2026-11-26T11:24:13Z",
      },
      active_loan: null,
      recent_bookings: [],
      relevant_projectors: [
        {
          id: "prj_1",
          asset_code: "PRJ-CONC-001",
          name: "Conc Projector 1",
          brand: "Epson",
          model: "EB-X500",
          physical_status: "AVAILABLE",
          is_active: true,
        },
      ],
      reminders: [
        {
          id: "rem_1",
          level: "info",
          message: "Anda memiliki booking aktif (BKG-CONC-2). Pengambilan proyektor dapat dilakukan pada jendela pickup.",
        },
      ],
    };

    getKomtingDashboardMock.mockResolvedValueOnce({ data: mockSummary });

    render(<KomtingDashboardView />);

    await waitFor(() => {
      expect(screen.getByText("Halo, Budi Santoso")).toBeInTheDocument();
      expect(screen.getByText("IF-TEST-02")).toBeInTheDocument();
      expect(screen.getByText("BKG-CONC-2")).toBeInTheDocument();
      expect(screen.getByText("Conc Projector 1")).toBeInTheDocument();
      expect(screen.getByText("PRJ-CONC-001")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Anda memiliki booking aktif (BKG-CONC-2). Pengambilan proyektor dapat dilakukan pada jendela pickup."
        )
      ).toBeInTheDocument();
    });
  });

  it("renders empty states when no active booking or loan exists", async () => {
    const mockEmptySummary: KomtingDashboardSummary = {
      active_assignment: {
        id: "asg_1",
        class_name: "IF-TEST-02",
        status: "ACTIVE",
      },
      active_booking: null,
      active_loan: null,
      recent_bookings: [],
      relevant_projectors: [],
      reminders: [],
    };

    getKomtingDashboardMock.mockResolvedValueOnce({ data: mockEmptySummary });

    render(<KomtingDashboardView />);

    await waitFor(() => {
      expect(screen.getByText("Belum Ada Booking Aktif")).toBeInTheDocument();
      expect(screen.getByText("Belum Ada Peminjaman Aktif")).toBeInTheDocument();
      expect(screen.getByText("Belum Ada Data Proyektor")).toBeInTheDocument();
    });
  });

  it("renders error state and retries on failure", async () => {
    const user = userEvent.setup();
    getKomtingDashboardMock
      .mockRejectedValueOnce(
        new ApiClientError({
          status: 500,
          code: "INTERNAL_ERROR",
          message: "Koneksi ke server gagal.",
        })
      )
      .mockResolvedValueOnce({
        data: {
          active_assignment: null,
          active_booking: null,
          active_loan: null,
          recent_bookings: [],
          relevant_projectors: [],
          reminders: [],
        },
      });

    render(<KomtingDashboardView />);

    await waitFor(() => {
      expect(screen.getByText("Gagal Memuat Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Koneksi ke server gagal.")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /coba lagi/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.queryByText("Gagal Memuat Dashboard")).not.toBeInTheDocument();
      expect(screen.getByText("Belum Ada Booking Aktif")).toBeInTheDocument();
    });
  });
});

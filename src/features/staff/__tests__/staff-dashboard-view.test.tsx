import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { StaffDashboardView } from "@/features/staff/staff-dashboard-view";

const getStaffDashboardMock = vi.fn();

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "staff_1",
      email: "staff@kampus.ac.id",
      full_name: "Petugas Operasional",
      role: "STAFF",
      account_status: "ACTIVE",
    },
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    admin: {
      getStaffDashboard: (...args: unknown[]) => getStaffDashboardMock(...args),
    },
  },
}));

describe("StaffDashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders operational summary counts, pending pickups, and active loans", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {
        bookings_today_count: 3,
        pending_pickup_count: 1,
        active_loans_count: 1,
        overdue_loans_count: 0,
        maintenance_units_count: 1,
        pending_pickups: [
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
        active_loans: [
          {
            id: "loan_1",
            booking_id: "bkg_0",
            projector_id: "prj_2",
            komting_id: "u2",
            status: "ACTIVE",
            picked_up_at: "2026-11-26T02:00:00Z",
            returned_at: null,
            return_condition: null,
          },
        ],
        maintenance_units: [],
      },
      meta: { request_id: "req_1" },
    });

    render(<StaffDashboardView />);

    expect(await screen.findByText("BKG-20261126-001")).toBeInTheDocument();
    expect(screen.getByText("Komting ID: u1")).toBeInTheDocument();
    expect(screen.getByText("loan_1")).toBeInTheDocument();
    expect(screen.getByText("prj_2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan QR Pickup / Return" })).toBeInTheDocument();
  });

  it("handles partial or empty summary fields gracefully without fabricating counts", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {},
      meta: { request_id: "req_partial" },
    });

    render(<StaffDashboardView />);

    expect(await screen.findByText("Tidak Ada Pickup Menunggu")).toBeInTheDocument();
    expect(screen.getByText("Tidak Ada Loan Aktif")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });

  it("renders error state on failure", async () => {
    getStaffDashboardMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );

    render(<StaffDashboardView />);
    expect(await screen.findByText("Gagal Memuat Dashboard STAFF")).toBeInTheDocument();
  });
});

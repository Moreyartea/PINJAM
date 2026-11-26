import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { AdminDashboardView } from "@/features/admin/admin-dashboard-view";

const getStaffDashboardMock = vi.fn();
const listAdminApplicationsMock = vi.fn();

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "admin_1",
      email: "admin@kampus.ac.id",
      full_name: "Administrator Sistem",
      role: "ADMIN",
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
    application: {
      listAdminApplications: (...args: unknown[]) => listAdminApplicationsMock(...args),
    },
  },
}));

describe("AdminDashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state while fetching dashboard data", () => {
    getStaffDashboardMock.mockReturnValue(new Promise(() => undefined));
    listAdminApplicationsMock.mockReturnValue(new Promise(() => undefined));

    render(<AdminDashboardView />);

    expect(
      screen.getByText("Mengambil ringkasan operasional dan daftar pengajuan komting dari server.")
    ).toBeInTheDocument();
  });

  it("renders operational summary, pending komting count, projector units, activities, and STAFF links", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {
        bookings_today_count: 4,
        pending_pickup_count: 1,
        active_loans_count: 2,
        overdue_loans_count: 1,
        maintenance_units_count: 1,
        pending_pickups: [
          {
            id: "bkg_1",
            booking_code: "BKG-20261126-001",
            komting_id: "u1",
            projector_id: "prj_1",
            booking_date: "2026-11-26",
            start_time: "10:00:00",
            estimated_return_at: "2026-11-26T05:00:00Z",
            status: "CONFIRMED",
            pickup_window: {
              opens_at: "2026-11-26T02:30:00Z",
              closes_at: "2026-11-26T03:15:00Z",
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
        maintenance_units: [
          {
            id: "prj_3",
            asset_code: "PRJ-003",
            name: "Epson EB-E01",
            brand: "Epson",
            model: "EB-E01",
            physical_status: "MAINTENANCE",
            is_active: true,
          },
        ],
        recent_activities: [
          {
            id: "act_1",
            message: "Unit PRJ-003 ditandai maintenance.",
            timestamp: "2026-11-26T03:00:00Z",
          },
        ],
      },
      meta: { request_id: "req_d" },
    });

    listAdminApplicationsMock.mockResolvedValueOnce({
      data: [
        {
          application_id: "app_1",
          full_name: "Siti Aminah",
          class_name: "IF-01",
          status: "PENDING_VERIFICATION",
          submitted_at: "2026-11-26T01:00:00Z",
        },
        {
          application_id: "app_2",
          full_name: "Budi Santoso",
          class_name: "IF-02",
          status: "PENDING_REPLACEMENT_NOTICE",
          submitted_at: "2026-11-26T02:00:00Z",
        },
        {
          application_id: "app_3",
          full_name: "Rina",
          class_name: "IF-03",
          status: "APPROVED",
          submitted_at: "2026-11-25T01:00:00Z",
        },
      ],
      meta: {
        request_id: "req_a",
        pagination: { page: 1, page_size: 20, total_items: 3, total_pages: 1 },
      },
    });

    render(<AdminDashboardView />);

    expect(await screen.findByText("Siti Aminah • IF-01")).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso • IF-02")).toBeInTheDocument();
    expect(screen.queryByText("Rina • IF-03")).not.toBeInTheDocument();

    expect(screen.getByText("Epson EB-E01")).toBeInTheDocument();
    expect(screen.getByText("PRJ-003")).toBeInTheDocument();
    expect(screen.getByText("Unit PRJ-003 ditandai maintenance.")).toBeInTheDocument();
    expect(screen.getByText("BKG-20261126-001")).toBeInTheDocument();
    expect(screen.getByText("loan_1")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Buka Operasional STAFF" })).toHaveAttribute(
      "href",
      "/staff"
    );
    expect(screen.getByRole("link", { name: "Kelola Maintenance STAFF" })).toHaveAttribute(
      "href",
      "/staff/maintenance"
    );
  });

  it("renders empty state when dashboard summary and applications list are empty", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {},
      meta: { request_id: "req_empty_d" },
    });
    listAdminApplicationsMock.mockResolvedValueOnce({
      data: [],
      meta: {
        request_id: "req_empty_a",
        pagination: { page: 1, page_size: 20, total_items: 0, total_pages: 0 },
      },
    });

    render(<AdminDashboardView />);

    expect(await screen.findByText("Belum Ada Data Ringkasan ADMIN")).toBeInTheDocument();
    expect(screen.getByText("Tidak Ada Pengajuan Pending")).toBeInTheDocument();
    expect(screen.getByText("Belum Ada Aktivitas Terbaru")).toBeInTheDocument();
  });

  it("handles missing partial fields defensively without fabricating zeros", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {
        active_loans_count: 3,
      },
      meta: { request_id: "req_partial_d" },
    });
    listAdminApplicationsMock.mockResolvedValueOnce({
      data: [
        {
          application_id: "app_pending",
          full_name: "Dewi",
          class_name: "SI-01",
          status: "PENDING_REVIEW",
          submitted_at: "2026-11-26T04:00:00Z",
        },
      ],
      meta: {
        request_id: "req_partial_a",
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });

    render(<AdminDashboardView />);

    expect(await screen.findByText("Dewi • SI-01")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // Missing bookings_today_count, overdue_loans_count, maintenance_units_count render em-dash
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("does not display 0 when dashboard or applications requests fail, and supports retry", async () => {
    const user = userEvent.setup();

    getStaffDashboardMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );
    listAdminApplicationsMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );

    render(<AdminDashboardView />);

    expect(await screen.findByText("Gagal Memuat Dashboard ADMIN")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();

    // Retry where dashboard fails but applications succeed: dashboard metrics show "—", never "0"
    getStaffDashboardMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "TIMEOUT" })
    );
    listAdminApplicationsMock.mockResolvedValueOnce({
      data: [
        {
          application_id: "app_1",
          full_name: "Andi",
          class_name: "IF-01",
          status: "PENDING_VERIFICATION",
          submitted_at: "2026-11-26T01:00:00Z",
        },
      ],
      meta: {
        request_id: "req_retry_a",
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });

    await user.click(screen.getByRole("button", { name: "Coba Lagi" }));

    expect(await screen.findByText("Ringkasan Operasional Gagal Dimuat")).toBeInTheDocument();
    expect(screen.getByText("Andi • IF-01")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("—")).toHaveLength(4);
    });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("displays em-dash instead of 0 when applications endpoint fails while dashboard succeeds", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {
        bookings_today_count: 5,
        active_loans_count: 2,
        overdue_loans_count: 1,
        maintenance_units_count: 1,
      },
      meta: { request_id: "req_dash_ok" },
    });
    listAdminApplicationsMock.mockRejectedValueOnce(
      new ApiClientError({ status: 503, code: "NETWORK_ERROR" })
    );

    render(<AdminDashboardView />);

    expect(await screen.findByText("Daftar Pengajuan Komting Gagal Dimuat")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

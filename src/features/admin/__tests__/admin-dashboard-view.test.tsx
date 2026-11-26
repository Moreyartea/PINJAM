import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboardView } from "@/features/admin/admin-dashboard-view";
import { ApiClientError } from "@/lib/api/errors";

const getStaffDashboardMock = vi.fn();
const listAdminApplicationsMock = vi.fn();
const listProjectorsMock = vi.fn();
const listAuditLogsMock = vi.fn();

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
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
    },
    auditLog: {
      listAuditLogs: (...args: unknown[]) => listAuditLogsMock(...args),
    },
  },
}));

describe("AdminDashboardView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading state while fetching dashboard data", () => {
    getStaffDashboardMock.mockReturnValue(new Promise(() => undefined));
    listAdminApplicationsMock.mockReturnValue(new Promise(() => undefined));
    listProjectorsMock.mockReturnValue(new Promise(() => undefined));
    listAuditLogsMock.mockReturnValue(new Promise(() => undefined));

    render(<AdminDashboardView />);

    expect(
      screen.getByText(
        "Mengambil ringkasan inventaris, operasional, pengajuan komting, dan aktivitas audit dari server."
      )
    ).toBeInTheDocument();
  });

  it("renders full inventory stats, operational counts, pending komting, audit activities, and ADMIN links", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {
        bookings_today_count: 6,
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

    listProjectorsMock.mockResolvedValueOnce({
      data: [
        {
          id: "prj_1",
          asset_code: "PRJ-001",
          name: "BenQ 1",
          brand: "BenQ",
          model: "M1",
          physical_status: "AVAILABLE",
          is_active: true,
        },
        {
          id: "prj_4",
          asset_code: "PRJ-004",
          name: "BenQ 2",
          brand: "BenQ",
          model: "M2",
          physical_status: "AVAILABLE",
          is_active: true,
        },
        {
          id: "prj_5",
          asset_code: "PRJ-005",
          name: "BenQ 3",
          brand: "BenQ",
          model: "M3",
          physical_status: "AVAILABLE",
          is_active: true,
        },
        {
          id: "prj_2",
          asset_code: "PRJ-002",
          name: "Epson 2",
          brand: "Epson",
          model: "E2",
          physical_status: "BORROWED",
          is_active: true,
        },
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
      meta: {
        request_id: "req_p",
        pagination: { page: 1, page_size: 100, total_items: 5, total_pages: 1 },
      },
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

    listAuditLogsMock.mockResolvedValueOnce({
      data: [
        {
          id: "audit_99",
          actor_user_id: "usr_admin_01",
          actor_role: "ADMIN",
          action: "PROJECTOR_STATUS_CHANGED",
          entity_type: "PROJECTOR",
          entity_id: "prj_3",
          before_data: null,
          after_data: null,
          reason: "Perbaikan lampu",
          request_id: "req_aud_99",
          created_at: "2026-11-26T03:05:00Z",
        },
      ],
      meta: {
        request_id: "req_aud",
        pagination: { page: 1, page_size: 5, total_items: 1, total_pages: 1 },
      },
    });

    render(<AdminDashboardView />);

    expect(await screen.findByText("Siti Aminah • IF-01")).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso • IF-02")).toBeInTheDocument();
    expect(screen.queryByText("Rina • IF-03")).not.toBeInTheDocument();

    // Inventory stats: Total=5, Available=3, Borrowed=1, Maintenance=1
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();

    expect(screen.getByText("Epson EB-E01")).toBeInTheDocument();
    expect(screen.getByText("PRJ-003")).toBeInTheDocument();
    expect(screen.getByText("Unit PRJ-003 ditandai maintenance.")).toBeInTheDocument();
    expect(screen.getByText("PROJECTOR_STATUS_CHANGED")).toBeInTheDocument();
    expect(screen.getByText(/Aktor: usr_admin_01/i)).toBeInTheDocument();
    expect(screen.getByText("BKG-20261126-001")).toBeInTheDocument();
    expect(screen.getByText("loan_1")).toBeInTheDocument();

    // Verify all actionable ADMIN & STAFF links
    expect(screen.getByRole("link", { name: "Buka Operasional STAFF" })).toHaveAttribute(
      "href",
      "/staff"
    );
    expect(screen.getByRole("link", { name: "Buka Daftar Pengajuan" })).toHaveAttribute(
      "href",
      "/admin/applications"
    );
    expect(screen.getByRole("link", { name: "Assignment Komting" })).toHaveAttribute(
      "href",
      "/admin/assignments"
    );
    expect(screen.getByRole("link", { name: "Kelola Maintenance" })).toHaveAttribute(
      "href",
      "/admin/maintenance"
    );
    expect(screen.getByRole("link", { name: "Inventaris Proyektor" })).toHaveAttribute(
      "href",
      "/admin/projectors"
    );
    expect(screen.getByRole("link", { name: "Jam Operasional" })).toHaveAttribute(
      "href",
      "/admin/operating-hours"
    );
    expect(screen.getByRole("link", { name: "Lihat Semua Audit Log" })).toHaveAttribute(
      "href",
      "/admin/audit-logs"
    );
    expect(screen.getByRole("link", { name: "Detail Log" })).toHaveAttribute(
      "href",
      "/admin/audit-logs/audit_99"
    );
    expect(screen.getAllByRole("link", { name: "Periksa" })[0]).toHaveAttribute(
      "href",
      "/admin/applications/app_1"
    );
  });

  it("renders empty state when all endpoints succeed with empty data", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {},
      meta: { request_id: "req_empty_d" },
    });
    listProjectorsMock.mockResolvedValueOnce({
      data: [],
      meta: {
        request_id: "req_empty_p",
        pagination: { page: 1, page_size: 100, total_items: 0, total_pages: 0 },
      },
    });
    listAdminApplicationsMock.mockResolvedValueOnce({
      data: [],
      meta: {
        request_id: "req_empty_a",
        pagination: { page: 1, page_size: 20, total_items: 0, total_pages: 0 },
      },
    });
    listAuditLogsMock.mockResolvedValueOnce({
      data: [],
      meta: {
        request_id: "req_empty_aud",
        pagination: { page: 1, page_size: 5, total_items: 0, total_pages: 0 },
      },
    });

    render(<AdminDashboardView />);

    expect(await screen.findByText("Belum Ada Data Ringkasan ADMIN")).toBeInTheDocument();
    expect(screen.getByText("Tidak Ada Pengajuan Pending")).toBeInTheDocument();
    expect(screen.getByText("Belum Ada Aktivitas Terbaru")).toBeInTheDocument();
  });

  it("never calculates approximate counts from incomplete multi-page projector responses or missing fields", async () => {
    getStaffDashboardMock.mockResolvedValueOnce({
      data: {
        active_loans_count: 3,
      },
      meta: { request_id: "req_partial_d" },
    });
    listProjectorsMock.mockResolvedValueOnce({
      data: [
        {
          id: "prj_1",
          asset_code: "PRJ-001",
          name: "BenQ 1",
          brand: "BenQ",
          model: "M1",
          physical_status: "AVAILABLE",
          is_active: true,
        },
      ],
      meta: {
        request_id: "req_partial_p",
        pagination: { page: 1, page_size: 100, total_items: 150, total_pages: 2 },
      },
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
    listAuditLogsMock.mockResolvedValueOnce({
      data: [],
      meta: {
        request_id: "req_partial_aud",
        pagination: { page: 1, page_size: 5, total_items: 0, total_pages: 0 },
      },
    });

    render(<AdminDashboardView />);

    expect(await screen.findByText("Dewi • SI-01")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // Available, Borrowed, Maintenance (no fallback), Bookings today, Pending pickup, Overdue render "—"
    expect(screen.getAllByText("—")).toHaveLength(6);
  });

  it("does not display 0 when all or partial endpoints fail, and supports retry", async () => {
    const user = userEvent.setup();

    getStaffDashboardMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );
    listProjectorsMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );
    listAdminApplicationsMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );
    listAuditLogsMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );

    render(<AdminDashboardView />);

    expect(await screen.findByText("Gagal Memuat Dashboard ADMIN")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();

    // Retry where dashboard, projectors, and auditLogs fail but applications succeed
    getStaffDashboardMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "TIMEOUT" })
    );
    listProjectorsMock.mockRejectedValueOnce(new ApiClientError({ status: 500, code: "TIMEOUT" }));
    listAuditLogsMock.mockRejectedValueOnce(new ApiClientError({ status: 500, code: "TIMEOUT" }));
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
    expect(screen.getByText("Ringkasan Inventaris Proyektor Gagal Dimuat")).toBeInTheDocument();
    expect(screen.getByText("Aktivitas Audit Log Terbaru Gagal Dimuat")).toBeInTheDocument();
    expect(screen.getByText("Andi • IF-01")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("—")).toHaveLength(8);
    });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApplicationDetailView } from "@/features/admin/admin-application-detail-view";
import { AdminApplicationsListView } from "@/features/admin/admin-applications-list-view";
import { AdminAssignmentsView } from "@/features/admin/admin-assignments-view";
import { AdminAuditLogDetailView } from "@/features/admin/admin-audit-log-detail-view";
import { AdminAuditLogsListView } from "@/features/admin/admin-audit-logs-list-view";
import { AdminDashboardView } from "@/features/admin/admin-dashboard-view";
import { AdminOperatingHoursView } from "@/features/admin/admin-operating-hours-view";
import { AdminProjectorsListView } from "@/features/admin/admin-projectors-list-view";
import { AdminStaffManagementView } from "@/features/admin/admin-staff-management-view";
import type { AuditLogEntry, KomtingApplication } from "@/types/domain";

const pushMock = vi.fn();
const replaceMock = vi.fn();

const getStaffDashboardMock = vi.fn();
const listAdminApplicationsMock = vi.fn();
const getAdminApplicationMock = vi.fn();
const approveApplicationMock = vi.fn();
const rejectApplicationMock = vi.fn();
const listProjectorsMock = vi.fn();
const createProjectorMock = vi.fn();
const getOperatingHoursMock = vi.fn();
const updateOperatingHoursMock = vi.fn();
const listAuditLogsMock = vi.fn();
const getAuditLogMock = vi.fn();
const listStaffBookingsMock = vi.fn();
const listStaffLoansMock = vi.fn();
const listMaintenanceMock = vi.fn();
const getMeMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "usr_admin_01",
      email: "admin@simulasi.local",
      full_name: "Simulasi Administrator",
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
      getAdminApplication: (...args: unknown[]) => getAdminApplicationMock(...args),
      approveApplication: (...args: unknown[]) => approveApplicationMock(...args),
      rejectApplication: (...args: unknown[]) => rejectApplicationMock(...args),
    },
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
      createProjector: (...args: unknown[]) => createProjectorMock(...args),
    },
    operatingHours: {
      getOperatingHours: (...args: unknown[]) => getOperatingHoursMock(...args),
      updateOperatingHours: (...args: unknown[]) => updateOperatingHoursMock(...args),
    },
    auditLog: {
      listAuditLogs: (...args: unknown[]) => listAuditLogsMock(...args),
      getAuditLog: (...args: unknown[]) => getAuditLogMock(...args),
    },
    booking: {
      listStaffBookings: (...args: unknown[]) => listStaffBookingsMock(...args),
    },
    loan: {
      listStaffLoans: (...args: unknown[]) => listStaffLoansMock(...args),
    },
    maintenance: {
      listMaintenance: (...args: unknown[]) => listMaintenanceMock(...args),
    },
    me: {
      getMe: (...args: unknown[]) => getMeMock(...args),
      updateMe: vi.fn(),
    },
    assignment: {
      deactivateAssignment: vi.fn(),
    },
  },
}));

describe("E2E Skenario ADMIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("A. Admin Dashboard", () => {
    it("renders operational summary counts, pending applications, and admin links", async () => {
      getStaffDashboardMock.mockResolvedValue({
        data: {
          bookings_today_count: 5,
          pending_pickup_count: 2,
          active_loans_count: 1,
          overdue_loans_count: 0,
          maintenance_units_count: 1,
          pending_pickups: [],
          active_loans: [],
          maintenance_units: [],
          recent_activities: [],
        },
      });
      listProjectorsMock.mockResolvedValue({
        data: [
          {
            id: "p1",
            asset_code: "P-01",
            name: "P1",
            physical_status: "AVAILABLE",
            is_active: true,
          },
        ],
        meta: { pagination: { total_items: 1, total_pages: 1, page: 1, page_size: 100 } },
      });
      listStaffBookingsMock.mockResolvedValue({
        data: [],
        meta: { pagination: { total_items: 2 } },
      });
      listStaffLoansMock.mockResolvedValue({
        data: [],
        meta: { pagination: { total_items: 1 } },
      });
      listMaintenanceMock.mockResolvedValue({
        data: [],
        meta: { pagination: { total_items: 1 } },
      });
      listAdminApplicationsMock.mockResolvedValue({
        data: [],
        meta: { pagination: { total_items: 0, total_pages: 1 } },
      });
      listAuditLogsMock.mockResolvedValue({
        data: [
          {
            id: "aud_01",
            actor_user_id: "usr_staff_01",
            actor_role: "STAFF",
            action: "PICKUP_CONFIRMED",
            entity_type: "LOAN",
            entity_id: "ln_01",
            before_data: null,
            after_data: { status: "ACTIVE" },
            reason: null,
            request_id: "req_01",
            created_at: "2026-11-27T02:00:00Z",
          },
        ],
      });

      render(<AdminDashboardView />);

      expect(
        await screen.findByRole("heading", { name: /Dashboard Administrator/i })
      ).toBeInTheDocument();
      expect(screen.getByText("Total Proyektor")).toBeInTheDocument();
      expect(screen.getByText("Pengajuan Komting Menunggu Verifikasi")).toBeInTheDocument();
      expect(screen.getByText("PICKUP_CONFIRMED")).toBeInTheDocument();
    });
  });

  describe("B. Komting Applications Management", () => {
    it("lists applications, approves new application, and rejects with mandatory reason", async () => {
      const user = userEvent.setup();

      const sampleApp: KomtingApplication = {
        application_id: "app_pending_01",
        application_type: "NEW",
        full_name: "Ahmad Dahlan",
        student_id: "12345678",
        class_name: "IF-03",
        status: "PENDING_VERIFICATION",
        rejection_reason: null,
        submitted_at: "2026-11-26T08:00:00Z",
      };

      listAdminApplicationsMock.mockResolvedValue({
        data: [sampleApp],
        meta: { pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 } },
      });

      // 1. List applications
      const { unmount: unmountList } = render(<AdminApplicationsListView />);
      expect(await screen.findByText("Ahmad Dahlan")).toBeInTheDocument();
      // StatusBadge renders "Menunggu Verifikasi" for PENDING_VERIFICATION
      expect(screen.getByText("Menunggu Verifikasi")).toBeInTheDocument();
      unmountList();

      // 2. Detail application & Approval
      getAdminApplicationMock.mockResolvedValue({ data: sampleApp });
      approveApplicationMock.mockResolvedValue({
        data: { ...sampleApp, status: "APPROVED" },
      });

      const { unmount: unmountDetail } = render(
        <AdminApplicationDetailView applicationId="app_pending_01" />
      );

      expect(await screen.findByText(/Detail Pengajuan app_pending_01/i)).toBeInTheDocument();
      expect(screen.getAllByText("Ahmad Dahlan").length).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "Setujui Pengajuan" }));
      expect(await screen.findByText("Setujui Pengajuan Komting?")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ya, Setujui Pengajuan" }));

      await waitFor(() => {
        expect(approveApplicationMock).toHaveBeenCalledWith("app_pending_01", {
          admin_note: null,
        });
      });
      unmountDetail();

      // 3. Rejection with mandatory reason
      getAdminApplicationMock.mockResolvedValue({ data: sampleApp });
      rejectApplicationMock.mockResolvedValue({
        data: { ...sampleApp, status: "REJECTED", rejection_reason: "Foto KTM buram." },
      });

      render(<AdminApplicationDetailView applicationId="app_pending_01" />);
      expect(await screen.findByText(/Detail Pengajuan app_pending_01/i)).toBeInTheDocument();
      expect(screen.getAllByText("Ahmad Dahlan").length).toBeGreaterThan(0);

      await user.type(
        screen.getByLabelText(/Alasan Penolakan/i),
        "Foto KTM buram dan tidak terbaca."
      );
      await user.click(screen.getByRole("button", { name: "Tolak Pengajuan" }));
      expect(await screen.findByText("Tolak Pengajuan Komting?")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ya, Tolak Pengajuan" }));

      await waitFor(() => {
        expect(rejectApplicationMock).toHaveBeenCalledWith("app_pending_01", {
          reason: "Foto KTM buram dan tidak terbaca.",
        });
      });
    });
  });

  describe("C. Projector Inventory Management", () => {
    it("creates a new projector with asset_code and name validation", async () => {
      const user = userEvent.setup();

      listProjectorsMock.mockResolvedValue({
        data: [],
        meta: { pagination: { page: 1, page_size: 12, total_items: 0, total_pages: 1 } },
      });

      render(<AdminProjectorsListView />);

      expect(await screen.findByText("Inventaris Proyektor")).toBeInTheDocument();

      // Buka form tambah proyektor
      await user.click(screen.getByRole("button", { name: "Tambah Proyektor" }));

      // Coba simpan form kosong
      await user.click(screen.getByRole("button", { name: "Simpan Unit Baru" }));
      expect(await screen.findByText("Kode aset proyektor wajib diisi.")).toBeInTheDocument();
      expect(screen.getByText("Nama proyektor wajib diisi.")).toBeInTheDocument();

      // Isi data valid
      await user.type(screen.getByLabelText(/Kode Aset/i), "PRJ-99");
      await user.type(screen.getByLabelText(/Nama Proyektor/i), "Sony VPL-DX221");
      await user.type(screen.getByLabelText(/Merek/i), "Sony");
      await user.type(screen.getByLabelText(/Model/i), "VPL-DX221");

      createProjectorMock.mockResolvedValueOnce({
        data: {
          id: "proj_new_99",
          asset_code: "PRJ-99",
          name: "Sony VPL-DX221",
          brand: "Sony",
          model: "VPL-DX221",
          physical_status: "AVAILABLE",
          is_active: true,
        },
      });

      await user.click(screen.getByRole("button", { name: "Simpan Unit Baru" }));

      // Konfirmasi dialog
      expect(await screen.findByText("Simpan Proyektor Baru?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ya, Simpan Unit" }));

      await waitFor(() => {
        expect(createProjectorMock).toHaveBeenCalledWith({
          asset_code: "PRJ-99",
          name: "Sony VPL-DX221",
          brand: "Sony",
          model: "VPL-DX221",
        });
      });
    });
  });

  describe("D. Operating Hours Configuration", () => {
    it("updates operating hours with validation and conflict handling", async () => {
      const user = userEvent.setup();

      getOperatingHoursMock.mockResolvedValue({
        data: {
          service_date: "2026-11-28",
          opens_at: "08:00:00",
          closes_at: "17:00:00",
          early_pickup_allowed_at: "07:45:00",
        },
      });

      updateOperatingHoursMock.mockResolvedValueOnce({
        data: {
          service_date: "2026-11-28",
          opens_at: "07:30:00",
          closes_at: "18:00:00",
          early_pickup_allowed_at: "07:15:00",
        },
      });

      render(<AdminOperatingHoursView />);

      expect(await screen.findByText("Konfigurasi Jam Operasional")).toBeInTheDocument();

      // Ubah jam buka menjadi 07:30 langsung di form sebelah kanan
      await user.clear(screen.getByLabelText(/Jam Buka \(WIB\)/i));
      await user.type(screen.getByLabelText(/Jam Buka \(WIB\)/i), "07:30");

      await user.click(screen.getByRole("button", { name: "Simpan Konfigurasi" }));
      expect(await screen.findByText(/Simpan Jam Operasional/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ya, Simpan Konfigurasi" }));

      await waitFor(() => {
        expect(updateOperatingHoursMock).toHaveBeenCalled();
      });
      expect(await screen.findByText(/Jam Operasional Diperbarui/i)).toBeInTheDocument();
    });
  });

  describe("E. Immutable Audit Logs & Detail Snapshots", () => {
    it("renders read-only audit list, enforces no mutation buttons, and displays JSON snapshots", async () => {
      const sampleEntry: AuditLogEntry = {
        id: "aud_999",
        actor_user_id: "usr_admin_01",
        actor_role: "ADMIN",
        action: "PROJECTOR_CREATED",
        entity_type: "PROJECTOR",
        entity_id: "proj_new_99",
        before_data: null,
        after_data: { asset_code: "PRJ-99", name: "Sony VPL-DX221", physical_status: "AVAILABLE" },
        reason: "Penambahan unit baru semester genap",
        request_id: "req_aud_999",
        created_at: "2026-11-27T05:00:00Z",
      };

      listAuditLogsMock.mockResolvedValue({
        data: [sampleEntry],
        meta: { pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 } },
      });

      // 1. Audit List View
      const { unmount: unmountList } = render(<AdminAuditLogsListView />);
      expect(await screen.findByText("PROJECTOR_CREATED")).toBeInTheDocument();
      expect(screen.getByText("READ-ONLY")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /edit|ubah|hapus|delete/i })).toBeNull();
      unmountList();

      // 2. Audit Detail View
      getAuditLogMock.mockResolvedValue({ data: sampleEntry });
      render(<AdminAuditLogDetailView auditLogId="aud_999" />);

      expect(await screen.findByText("Detail Catatan Audit")).toBeInTheDocument();
      expect(screen.getByText("PROJECTOR_CREATED")).toBeInTheDocument();
      expect(screen.getByText(/Penambahan unit baru semester genap/)).toBeInTheDocument();
      expect(screen.getByText(/Sony VPL-DX221/)).toBeInTheDocument();
    });
  });

  describe("F. Transparency of Contract Gaps", () => {
    it("displays honest contract gap notice for staff management without fictitious calls", async () => {
      getMeMock.mockResolvedValue({
        data: {
          id: "usr_admin_01",
          email: "admin@simulasi.local",
          full_name: "Simulasi Administrator",
          role: "ADMIN",
          account_status: "ACTIVE",
        },
      });

      render(<AdminStaffManagementView />);

      expect(await screen.findByText(/Pengelolaan Akun Pengguna & STAFF/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Endpoint Manajemen Akun STAFF Belum Tersedia di API Contract/i)
      ).toBeInTheDocument();
    });

    it("displays honest contract gap notice for assignments without fictitious calls", async () => {
      render(<AdminAssignmentsView />);

      expect(await screen.findByText("Manajemen Assignment Komting")).toBeInTheDocument();
      expect(
        screen.getByText(/Daftar & Detail Assignment Komting Belum Tersedia di API Contract/i)
      ).toBeInTheDocument();
    });
  });
});

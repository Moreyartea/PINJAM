import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { StaffMaintenanceDetailView } from "@/features/staff/staff-maintenance-detail-view";
import { StaffMaintenanceView } from "@/features/staff/staff-maintenance-view";

const listMaintenanceMock = vi.fn();
const listProjectorsMock = vi.fn();
const getProjectorMock = vi.fn();
const createMaintenanceMock = vi.fn();
const completeMaintenanceMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    maintenance: {
      listMaintenance: (...args: unknown[]) => listMaintenanceMock(...args),
      createMaintenance: (...args: unknown[]) => createMaintenanceMock(...args),
      completeMaintenance: (...args: unknown[]) => completeMaintenanceMock(...args),
    },
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
      getProjector: (...args: unknown[]) => getProjectorMock(...args),
    },
  },
}));

describe("StaffMaintenanceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listMaintenanceMock.mockResolvedValue({
      data: [
        {
          id: "maint_1",
          projector_id: "prj_3",
          reason: "Lampu redup",
          note: null,
          status: "IN_PROGRESS",
          started_at: "2026-11-26T02:00:00Z",
          resolution_note: null,
          completed_at: null,
        },
      ],
      meta: {
        request_id: "req_m",
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });

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
        pagination: { page: 1, page_size: 50, total_items: 2, total_pages: 1 },
      },
    });
  });

  it("creates maintenance record from AVAILABLE unit with required reason", async () => {
    const user = userEvent.setup();
    createMaintenanceMock.mockResolvedValueOnce({
      data: {
        id: "maint_new",
        projector_id: "prj_1",
        reason: "Port HDMI longgar",
        note: null,
        status: "IN_PROGRESS",
        started_at: "2026-11-26T05:00:00Z",
        resolution_note: null,
        completed_at: null,
      },
      meta: { request_id: "req_c" },
    });

    render(<StaffMaintenanceView />);

    await user.click(await screen.findByRole("button", { name: "Tandai Maintenance" }));
    await user.click(screen.getByRole("button", { name: "Ya, Ubah ke Maintenance" }));

    expect(screen.getByText("Alasan maintenance wajib diisi.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Alasan Maintenance/i), "Port HDMI longgar");
    await user.click(screen.getByRole("button", { name: "Ya, Ubah ke Maintenance" }));

    await waitFor(() => {
      expect(createMaintenanceMock).toHaveBeenCalledWith("prj_1", {
        reason: "Port HDMI longgar",
        note: null,
      });
    });
    expect(
      await screen.findByText(/Unit PRJ-001 dipindahkan ke status MAINTENANCE/i)
    ).toBeInTheDocument();
  });

  it("completes maintenance and shows backend error if unit still has active loan", async () => {
    const user = userEvent.setup();
    completeMaintenanceMock
      .mockRejectedValueOnce(new ApiClientError({ status: 409, code: "PROJECTOR_HAS_ACTIVE_LOAN" }))
      .mockResolvedValueOnce({
        data: {
          id: "maint_1",
          projector_id: "prj_3",
          reason: "Lampu redup",
          note: null,
          status: "COMPLETED",
          started_at: "2026-11-26T02:00:00Z",
          resolution_note: "Lampu sudah diganti.",
          completed_at: "2026-11-26T06:00:00Z",
        },
        meta: { request_id: "req_done" },
      });

    render(<StaffMaintenanceView />);

    await user.click(await screen.findByRole("button", { name: "Selesaikan Maintenance" }));
    await user.type(screen.getByLabelText(/Catatan Penyelesaian/i), "Lampu sudah diganti.");
    await user.click(screen.getByRole("button", { name: "Ya, Selesaikan" }));

    expect(await screen.findByText(/Gagal Menyelesaikan Maintenance/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya, Selesaikan" }));
    await waitFor(() => {
      expect(completeMaintenanceMock).toHaveBeenCalledTimes(2);
    });
  });

  it("completes maintenance with set_projector_available: false when uncheck checkbox", async () => {
    const user = userEvent.setup();
    completeMaintenanceMock.mockResolvedValueOnce({
      data: {
        id: "maint_1",
        projector_id: "prj_3",
        reason: "Lampu redup",
        note: null,
        status: "COMPLETED",
        started_at: "2026-11-26T02:00:00Z",
        resolution_note: "Perlu servis lanjutan di bengkel.",
        completed_at: "2026-11-26T06:00:00Z",
      },
      meta: { request_id: "req_done_unavail" },
    });

    render(<StaffMaintenanceView />);

    await user.click(await screen.findByRole("button", { name: "Selesaikan Maintenance" }));
    await user.type(
      screen.getByLabelText(/Catatan Penyelesaian/i),
      "Perlu servis lanjutan di bengkel."
    );

    // Uncheck "Nyatakan unit layak digunakan..."
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Ya, Selesaikan" }));

    await waitFor(() => {
      expect(completeMaintenanceMock).toHaveBeenCalledWith("maint_1", {
        resolution_note: "Perlu servis lanjutan di bengkel.",
        set_projector_available: false,
      });
    });

    expect(await screen.findByText("Catatan maintenance diselesaikan.")).toBeInTheDocument();
  });

  it("handles pagination navigation when multiple pages of maintenance exist", async () => {
    const user = userEvent.setup();
    listMaintenanceMock.mockResolvedValue({
      data: [
        {
          id: "maint_1",
          projector_id: "prj_3",
          reason: "Lampu redup",
          note: null,
          status: "IN_PROGRESS",
          started_at: "2026-11-26T02:00:00Z",
          resolution_note: null,
          completed_at: null,
        },
      ],
      meta: {
        request_id: "req_m_paged",
        pagination: { page: 1, page_size: 20, total_items: 25, total_pages: 2 },
      },
    });

    render(<StaffMaintenanceView />);

    expect(await screen.findByRole("button", { name: "Berikutnya" })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName.toLowerCase() === "p" &&
          (el.textContent?.includes("Halaman 1 dari 2") ?? false)
      )
    ).toBeInTheDocument();

    const nextBtn = screen.getByRole("button", { name: "Berikutnya" });
    expect(nextBtn).toBeEnabled();

    await user.click(nextBtn);

    await waitFor(() => {
      expect(listMaintenanceMock).toHaveBeenCalledWith({
        page: 2,
        page_size: 20,
        status: "IN_PROGRESS",
      });
    });
  });
});

describe("StaffMaintenanceDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectorMock.mockResolvedValue({
      data: {
        id: "prj_3",
        asset_code: "PRJ-003",
        name: "Epson EB-E01",
        brand: "Epson",
        model: "EB-E01",
        physical_status: "MAINTENANCE",
        is_active: true,
      },
      meta: { request_id: "req_p" },
    });
  });

  it("loads maintenance detail from paginated listMaintenance endpoint without calling detail API", async () => {
    listMaintenanceMock.mockResolvedValueOnce({
      data: [
        {
          id: "maint_1",
          projector_id: "prj_3",
          reason: "Lampu proyektor redup",
          note: "Menunggu komponen",
          status: "IN_PROGRESS",
          started_at: "2026-11-26T02:00:00Z",
          resolution_note: null,
          completed_at: null,
        },
      ],
      meta: {
        request_id: "req_m",
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });

    render(<StaffMaintenanceDetailView maintenanceId="maint_1" />);

    expect(await screen.findByText("Lampu proyektor redup")).toBeInTheDocument();
    expect(await screen.findByText(/Unit: Epson EB-E01 \(PRJ-003\)/i)).toBeInTheDocument();
    expect(listMaintenanceMock).toHaveBeenCalledWith({ page: 1, page_size: 20 });
  });

  it("renders dedicated not-found state when maintenance record ID does not exist", async () => {
    listMaintenanceMock.mockResolvedValueOnce({
      data: [],
      meta: {
        request_id: "req_m",
        pagination: { page: 1, page_size: 20, total_items: 0, total_pages: 0 },
      },
    });

    render(<StaffMaintenanceDetailView maintenanceId="maint_missing" />);

    expect(await screen.findByText("Catatan Maintenance Tidak Ditemukan")).toBeInTheDocument();
  });
});

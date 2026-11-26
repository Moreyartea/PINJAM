import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMaintenanceView } from "@/features/admin/admin-maintenance-view";
import { ApiClientError } from "@/lib/api/errors";
import type { MaintenanceRecord, Projector } from "@/types/domain";

const listMaintenanceMock = vi.fn();
const createMaintenanceMock = vi.fn();
const completeMaintenanceMock = vi.fn();
const listProjectorsMock = vi.fn();

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
    },
  },
}));

const SAMPLE_PROJECTORS: Projector[] = [
  {
    id: "proj_maint_1",
    asset_code: "PRJ-03",
    name: "Epson EB-X500",
    brand: "Epson",
    model: "EB-X500",
    physical_status: "MAINTENANCE",
    is_active: true,
  },
  {
    id: "proj_avail_1",
    asset_code: "PRJ-01",
    name: "BenQ MS550",
    brand: "BenQ",
    model: "MS550",
    physical_status: "AVAILABLE",
    is_active: true,
  },
];

const SAMPLE_MAINT: MaintenanceRecord[] = [
  {
    id: "maint_01",
    projector_id: "proj_maint_1",
    reason: "Lampu proyektor redup dan berkedip.",
    note: "Perlu penggantian bohlam.",
    status: "IN_PROGRESS",
    started_at: "2026-11-26T02:00:00Z",
    resolution_note: null,
    completed_at: null,
  },
];

describe("AdminMaintenanceView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading, error retry, and empty state when no maintenance data exists", async () => {
    const user = userEvent.setup();

    listMaintenanceMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "NETWORK_ERROR" }))
      .mockResolvedValue({
        data: [],
        meta: {
          request_id: "req_m_empty",
          pagination: { page: 1, page_size: 20, total_items: 0, total_pages: 0 },
        },
      });

    listProjectorsMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "NETWORK_ERROR" }))
      .mockResolvedValue({
        data: [],
        meta: {
          request_id: "req_p_empty",
          pagination: { page: 1, page_size: 50, total_items: 0, total_pages: 0 },
        },
      });

    render(<AdminMaintenanceView />);

    expect(screen.getAllByText("Memuat Unit Maintenance...").length).toBeGreaterThan(0);
    expect(await screen.findByText("Gagal Memuat Daftar Unit Proyektor")).toBeInTheDocument();
    expect(await screen.findByText("Gagal Memuat Catatan Maintenance")).toBeInTheDocument();

    const retryButtons = screen.getAllByRole("button", { name: "Coba Lagi" });
    await user.click(retryButtons[0]!);
    await user.click(retryButtons[1]!);

    expect(await screen.findByText("Tidak Ada Unit Berstatus MAINTENANCE")).toBeInTheDocument();
    expect(await screen.findByText("Belum Ada Catatan Maintenance")).toBeInTheDocument();
  });

  it("completes maintenance with confirmation, API error handling, and double-submit prevention", async () => {
    const user = userEvent.setup();

    listMaintenanceMock.mockResolvedValue({
      data: SAMPLE_MAINT,
      meta: {
        request_id: "req_m_list",
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });
    listProjectorsMock.mockResolvedValue({
      data: SAMPLE_PROJECTORS,
      meta: {
        request_id: "req_p_list",
        pagination: { page: 1, page_size: 50, total_items: 2, total_pages: 1 },
      },
    });

    let resolveComplete: ((value: unknown) => void) | undefined;
    completeMaintenanceMock
      .mockRejectedValueOnce(new ApiClientError({ status: 409, code: "PROJECTOR_HAS_ACTIVE_LOAN" }))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveComplete = resolve;
        })
      );

    render(<AdminMaintenanceView />);

    expect((await screen.findAllByText("PRJ-03")).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Lampu proyektor redup dan berkedip.").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Proyektor dalam status fisik.*tidak dapat dibooking/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Selesaikan & Nyatakan Layak" }));
    expect(await screen.findByText("Selesaikan Maintenance Unit?")).toBeInTheDocument();

    // Validation requires resolution note
    await user.click(screen.getByRole("button", { name: "Ya, Selesaikan Maintenance" }));
    expect(screen.getByText("Catatan penyelesaian maintenance wajib diisi.")).toBeInTheDocument();
    expect(completeMaintenanceMock).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText(/Catatan Penyelesaian/i),
      "Lampu diganti dan diuji normal."
    );
    await user.click(screen.getByRole("button", { name: "Ya, Selesaikan Maintenance" }));

    expect(await screen.findByText("Gagal Menyelesaikan Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Unit proyektor masih berstatus dipinjam.")).toBeInTheDocument();

    // Retry while request is pending (double-submit guard)
    const confirmBtn = screen.getByRole("button", { name: "Ya, Selesaikan Maintenance" });
    await user.click(confirmBtn);
    await user.click(confirmBtn);

    expect(completeMaintenanceMock).toHaveBeenCalledTimes(2);
    expect(completeMaintenanceMock).toHaveBeenLastCalledWith("maint_01", {
      resolution_note: "Lampu diganti dan diuji normal.",
      set_projector_available: true,
    });

    // Status success message must NOT appear before backend resolves
    expect(screen.queryByText("Status Maintenance Diperbarui")).not.toBeInTheDocument();

    resolveComplete?.({
      data: { ...SAMPLE_MAINT[0], status: "COMPLETED" },
      meta: { request_id: "req_complete_ok" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Maintenance selesai dan unit dinyatakan AVAILABLE kembali oleh server.")
      ).toBeInTheDocument();
    });
  });

  it("allows marking an AVAILABLE projector as MAINTENANCE via confirmation dialog", async () => {
    const user = userEvent.setup();

    listMaintenanceMock.mockResolvedValue({
      data: SAMPLE_MAINT,
      meta: {
        request_id: "req_m_list_2",
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });
    listProjectorsMock.mockResolvedValue({
      data: SAMPLE_PROJECTORS,
      meta: {
        request_id: "req_p_list_2",
        pagination: { page: 1, page_size: 50, total_items: 2, total_pages: 1 },
      },
    });
    createMaintenanceMock.mockResolvedValueOnce({
      data: {
        id: "maint_02",
        projector_id: "proj_avail_1",
        reason: "Kabel HDMI rusak",
        note: null,
        status: "IN_PROGRESS",
        started_at: "2026-11-26T04:00:00Z",
        resolution_note: null,
        completed_at: null,
      },
      meta: { request_id: "req_create_maint" },
    });

    render(<AdminMaintenanceView />);

    await screen.findByText("PRJ-01");
    await user.click(screen.getByRole("button", { name: "Tandai Maintenance" }));

    expect(await screen.findByText("Tandai PRJ-01 Maintenance?")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Alasan Maintenance/i), "Kabel HDMI rusak");
    await user.click(screen.getByRole("button", { name: "Ya, Tandai Maintenance" }));

    await waitFor(() => {
      expect(createMaintenanceMock).toHaveBeenCalledWith("proj_avail_1", {
        reason: "Kabel HDMI rusak",
        note: null,
      });
    });
    expect(
      await screen.findByText("Unit PRJ-01 (BenQ MS550) berhasil ditandai MAINTENANCE oleh server.")
    ).toBeInTheDocument();
  });
});

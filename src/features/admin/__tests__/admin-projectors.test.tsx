import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { AdminProjectorDetailView } from "@/features/admin/admin-projector-detail-view";
import { AdminProjectorsListView } from "@/features/admin/admin-projectors-list-view";

const listProjectorsMock = vi.fn();
const getProjectorMock = vi.fn();
const createProjectorMock = vi.fn();
const updateProjectorMock = vi.fn();
const deactivateProjectorMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
      getProjector: (...args: unknown[]) => getProjectorMock(...args),
      createProjector: (...args: unknown[]) => createProjectorMock(...args),
      updateProjector: (...args: unknown[]) => updateProjectorMock(...args),
      deactivateProjector: (...args: unknown[]) => deactivateProjectorMock(...args),
    },
  },
}));

describe("AdminProjectorsListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders inventory list with separated physical/active badges, supports search, status filter, and pagination", async () => {
    const user = userEvent.setup();
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
          id: "prj_2",
          asset_code: "PRJ-002",
          name: "BenQ MS560",
          brand: "BenQ",
          model: "MS560",
          physical_status: "MAINTENANCE",
          is_active: false,
        },
      ],
      meta: {
        request_id: "req_p1",
        pagination: { page: 1, page_size: 12, total_items: 20, total_pages: 2 },
      },
    });

    render(<AdminProjectorsListView />);

    expect(await screen.findByText("Epson EB-X500")).toBeInTheDocument();
    expect(screen.getByText("BenQ MS560")).toBeInTheDocument();
    expect(screen.getByText("Fisik: Tersedia")).toBeInTheDocument();
    expect(screen.getByText("Fisik: Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();

    // Search filters client-side on available fields
    await user.type(screen.getByLabelText("Cari Proyektor"), "BenQ");
    expect(screen.queryByText("Epson EB-X500")).not.toBeInTheDocument();
    expect(screen.getByText("BenQ MS560")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Cari Proyektor"));
    await user.click(screen.getByRole("button", { name: "Berikutnya" }));
    await waitFor(() => {
      expect(listProjectorsMock).toHaveBeenLastCalledWith({
        page: 2,
        page_size: 12,
        physical_status: undefined,
      });
    });

    await user.selectOptions(screen.getByLabelText("Filter Status Fisik"), "BORROWED");
    await waitFor(() => {
      expect(listProjectorsMock).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 12,
        physical_status: "BORROWED",
      });
    });
  });

  it("validates required fields, handles duplicate asset_code, prevents double-submit, and creates projector", async () => {
    const user = userEvent.setup();
    listProjectorsMock.mockResolvedValue({
      data: [],
      meta: {
        request_id: "req_list",
        pagination: { page: 1, page_size: 12, total_items: 0, total_pages: 0 },
      },
    });

    let resolveCreate: ((val: unknown) => void) | undefined;
    createProjectorMock
      .mockRejectedValueOnce(
        new ApiClientError({
          status: 409,
          code: "BOOKING_CONFLICT",
          message: "Kode aset PRJ-001 sudah terdaftar.",
          details: [{ field: "asset_code", reason: "Kode aset PRJ-001 sudah digunakan." }],
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
      );

    render(<AdminProjectorsListView />);
    expect(await screen.findByText("Tidak Ada Unit Proyektor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tambah Proyektor" }));
    await user.click(screen.getByRole("button", { name: "Simpan Unit Baru" }));

    expect(screen.getByText("Kode aset proyektor wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("Nama proyektor wajib diisi.")).toBeInTheDocument();
    expect(createProjectorMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Kode Aset/i), "PRJ-001");
    await user.type(screen.getByLabelText(/Nama Proyektor/i), "Epson EB-X500");
    await user.type(screen.getByLabelText(/Merek/i), "Epson");
    await user.type(screen.getByLabelText(/Model/i), "EB-X500");

    await user.click(screen.getByRole("button", { name: "Simpan Unit Baru" }));
    await user.click(screen.getByRole("button", { name: "Ya, Simpan Unit" }));

    expect(await screen.findByText("Kode aset PRJ-001 sudah digunakan.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Kode Aset/i));
    await user.type(screen.getByLabelText(/Kode Aset/i), "PRJ-099");
    await user.click(screen.getByRole("button", { name: "Simpan Unit Baru" }));

    const confirmBtn = screen.getByRole("button", { name: "Ya, Simpan Unit" });
    await user.click(confirmBtn);
    await user.click(confirmBtn);

    expect(createProjectorMock).toHaveBeenCalledTimes(2);
    expect(createProjectorMock).toHaveBeenLastCalledWith({
      asset_code: "PRJ-099",
      name: "Epson EB-X500",
      brand: "Epson",
      model: "EB-X500",
    });

    resolveCreate?.({
      data: {
        id: "prj_new",
        asset_code: "PRJ-099",
        name: "Epson EB-X500",
        brand: "Epson",
        model: "EB-X500",
        physical_status: "AVAILABLE",
        is_active: true,
      },
      meta: { request_id: "req_c" },
    });

    expect(
      await screen.findByText(/Unit Epson EB-X500 \(PRJ-099\) berhasil ditambahkan/i)
    ).toBeInTheDocument();
  });
});

describe("AdminProjectorDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders detail, disables asset_code editing, updates metadata, and guards double-submit", async () => {
    const user = userEvent.setup();
    getProjectorMock
      .mockResolvedValueOnce({
        data: {
          id: "prj_1",
          asset_code: "PRJ-001",
          name: "Epson EB-X500",
          brand: "Epson",
          model: "EB-X500",
          physical_status: "MAINTENANCE",
          is_active: true,
        },
        meta: { request_id: "req_g1" },
      })
      .mockResolvedValueOnce({
        data: {
          id: "prj_1",
          asset_code: "PRJ-001",
          name: "Epson EB-X500 Rev 2",
          brand: "Epson",
          model: "EB-X500-R2",
          physical_status: "MAINTENANCE",
          is_active: true,
        },
        meta: { request_id: "req_g2" },
      });

    let resolveUpdate: ((val: unknown) => void) | undefined;
    updateProjectorMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    render(<AdminProjectorDetailView projectorId="prj_1" />);

    expect(await screen.findByText("Unit Dalam Maintenance")).toBeInTheDocument();
    const assetCodeInput = screen.getByLabelText(/Kode Aset/i);
    expect(assetCodeInput).toBeDisabled();

    const nameInput = screen.getByLabelText(/Nama Proyektor/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Epson EB-X500 Rev 2");

    const modelInput = screen.getByLabelText(/Model/i);
    await user.clear(modelInput);
    await user.type(modelInput, "EB-X500-R2");

    await user.click(screen.getByRole("button", { name: "Simpan Perubahan Metadata" }));
    const confirmSaveBtn = screen.getByRole("button", { name: "Ya, Simpan Metadata" });
    await user.click(confirmSaveBtn);
    await user.click(confirmSaveBtn);

    expect(updateProjectorMock).toHaveBeenCalledTimes(1);
    expect(updateProjectorMock).toHaveBeenCalledWith("prj_1", {
      name: "Epson EB-X500 Rev 2",
      brand: "Epson",
      model: "EB-X500-R2",
    });

    resolveUpdate?.({
      data: {
        id: "prj_1",
        asset_code: "PRJ-001",
        name: "Epson EB-X500 Rev 2",
        brand: "Epson",
        model: "EB-X500-R2",
        physical_status: "MAINTENANCE",
        is_active: true,
      },
      meta: { request_id: "req_u" },
    });

    expect(await screen.findByText("Metadata proyektor berhasil diperbarui.")).toBeInTheDocument();
  });

  it("handles active loan conflict on deactivate, prevents double-submit, and deactivates unit", async () => {
    const user = userEvent.setup();
    getProjectorMock
      .mockResolvedValueOnce({
        data: {
          id: "prj_2",
          asset_code: "PRJ-002",
          name: "BenQ MS560",
          brand: "BenQ",
          model: "MS560",
          physical_status: "BORROWED",
          is_active: true,
        },
        meta: { request_id: "req_g1" },
      })
      .mockResolvedValueOnce({
        data: {
          id: "prj_2",
          asset_code: "PRJ-002",
          name: "BenQ MS560",
          brand: "BenQ",
          model: "MS560",
          physical_status: "INACTIVE",
          is_active: false,
        },
        meta: { request_id: "req_g2" },
      });

    deactivateProjectorMock
      .mockRejectedValueOnce(new ApiClientError({ status: 409, code: "PROJECTOR_HAS_ACTIVE_LOAN" }))
      .mockResolvedValueOnce({
        data: {
          id: "prj_2",
          asset_code: "PRJ-002",
          name: "BenQ MS560",
          brand: "BenQ",
          model: "MS560",
          physical_status: "INACTIVE",
          is_active: false,
        },
        meta: { request_id: "req_deact" },
      });

    render(<AdminProjectorDetailView projectorId="prj_2" />);

    expect(await screen.findByText("Unit Sedang Dipinjam")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nonaktifkan Proyektor" }));
    await user.click(screen.getByRole("button", { name: "Ya, Nonaktifkan Unit" }));

    expect(await screen.findByText("Penonaktifan Ditolak")).toBeInTheDocument();
    expect(screen.getByText(/Unit proyektor masih berstatus dipinjam/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya, Nonaktifkan Unit" }));
    await waitFor(() => {
      expect(deactivateProjectorMock).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByText(/Unit proyektor telah dinonaktifkan dari inventaris aktif/i)
    ).toBeInTheDocument();
    expect(await screen.findByText("Unit Sudah Nonaktif")).toBeInTheDocument();
  });
});

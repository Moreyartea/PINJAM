import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { ProjectorListView } from "@/features/projectors/projector-list-view";

const listProjectorsMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    projector: {
      listProjectors: (...args: unknown[]) => listProjectorsMock(...args),
    },
  },
}));

describe("ProjectorListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders projector units with separated physical status badges and no booking action", async () => {
    listProjectorsMock.mockResolvedValueOnce({
      data: [
        {
          id: "p1",
          asset_code: "PRJ-001",
          name: "Epson EB-X500",
          brand: "Epson",
          model: "EB-X500",
          physical_status: "AVAILABLE",
          is_active: true,
        },
        {
          id: "p2",
          asset_code: "PRJ-002",
          name: "BenQ MS560",
          brand: "BenQ",
          model: "MS560",
          physical_status: "BORROWED",
          is_active: true,
        },
      ],
      meta: {
        request_id: "req_1",
        pagination: { page: 1, page_size: 12, total_items: 2, total_pages: 1 },
      },
    });

    render(<ProjectorListView />);

    expect(await screen.findByText("Epson EB-X500")).toBeInTheDocument();
    expect(screen.getByText("BenQ MS560")).toBeInTheDocument();
    expect(screen.getByText("Tersedia")).toBeInTheDocument();
    expect(screen.getByText("Dipinjam")).toBeInTheDocument();
    expect(screen.getByText(/Pemisahan Status Fisik & Ketersediaan Booking/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Booking/i })).not.toBeInTheDocument();
  });

  it("filters projectors by physical_status when dropdown changes", async () => {
    const user = userEvent.setup();
    listProjectorsMock.mockResolvedValue({
      data: [],
      meta: {
        request_id: "req_2",
        pagination: { page: 1, page_size: 12, total_items: 0, total_pages: 0 },
      },
    });

    render(<ProjectorListView />);
    await screen.findByText("Tidak Ada Proyektor Ditemukan");

    await user.selectOptions(screen.getByLabelText("Filter Status Fisik"), "MAINTENANCE");

    await waitFor(() => {
      expect(listProjectorsMock).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 12,
        physical_status: "MAINTENANCE",
      });
    });
  });

  it("renders error state with retry action when request fails", async () => {
    listProjectorsMock.mockRejectedValueOnce(
      new ApiClientError({ status: 500, code: "NETWORK_ERROR" })
    );

    render(<ProjectorListView />);

    expect(await screen.findByText("Gagal Memuat Daftar Proyektor")).toBeInTheDocument();
    expect(screen.getByText("Kode: NETWORK_ERROR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coba Lagi" })).toBeInTheDocument();
  });
});

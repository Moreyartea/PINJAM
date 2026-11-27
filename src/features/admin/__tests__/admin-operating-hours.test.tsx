import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { AdminOperatingHoursView } from "@/features/admin/admin-operating-hours-view";

const getOperatingHoursMock = vi.fn();
const updateOperatingHoursMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    operatingHours: {
      getOperatingHours: (...args: unknown[]) => getOperatingHoursMock(...args),
      updateOperatingHours: (...args: unknown[]) => updateOperatingHoursMock(...args),
    },
  },
}));

describe("AdminOperatingHoursView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders operating hours snapshot in Asia/Jakarta and supports error retry", async () => {
    const user = userEvent.setup();
    getOperatingHoursMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce({
        data: {
          service_date: "2026-11-26",
          timezone: "Asia/Jakarta",
          opens_at: "08:00:00",
          closes_at: "17:00:00",
          configured_open_at: "08:00:00",
          early_pickup_allowed_at: "07:45:00",
        },
        meta: { request_id: "req_oh_1" },
      });

    render(<AdminOperatingHoursView />);

    expect(await screen.findByText("Gagal Memuat Jam Operasional")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Coba Lagi" }));

    expect(await screen.findByText("17:00 WIB")).toBeInTheDocument();
    expect(screen.getAllByText("07:45 WIB").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("08:00 WIB").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Asia/Jakarta").length).toBeGreaterThanOrEqual(1);
  });

  it("validates opening/closing and early-open times before submitting", async () => {
    const user = userEvent.setup();
    getOperatingHoursMock.mockResolvedValueOnce({
      data: {
        service_date: "2026-11-26",
        timezone: "Asia/Jakarta",
        opens_at: "08:00:00",
        closes_at: "17:00:00",
        configured_open_at: "08:00:00",
        early_pickup_allowed_at: "07:45:00",
      },
      meta: { request_id: "req_oh_2" },
    });

    render(<AdminOperatingHoursView />);

    const closesInput = await screen.findByLabelText(/Jam Tutup/i);
    await user.clear(closesInput);
    await user.type(closesInput, "07:30");

    const earlyInput = screen.getByLabelText(/Pembukaan Lebih Awal/i);
    await user.type(earlyInput, "09:00");

    await user.click(screen.getByRole("button", { name: "Simpan Konfigurasi" }));

    expect(screen.getByText("Jam tutup harus lebih akhir dari jam buka.")).toBeInTheDocument();
    expect(
      screen.getByText("Pembukaan lebih awal tidak boleh melampaui jam buka layanan.")
    ).toBeInTheDocument();
    expect(updateOperatingHoursMock).not.toHaveBeenCalled();
  });

  it("shows change summary dialog, updates operating hours, handles 409 conflicts, and guards double-submit", async () => {
    const user = userEvent.setup();
    getOperatingHoursMock
      .mockResolvedValueOnce({
        data: {
          service_date: "2026-11-26",
          timezone: "Asia/Jakarta",
          opens_at: "08:00:00",
          closes_at: "17:00:00",
          configured_open_at: "08:00:00",
          early_pickup_allowed_at: "07:45:00",
        },
        meta: { request_id: "req_oh_3" },
      })
      .mockResolvedValueOnce({
        data: {
          service_date: "2026-11-26",
          timezone: "Asia/Jakarta",
          opens_at: "07:00:00",
          closes_at: "18:00:00",
          configured_open_at: "07:00:00",
          early_pickup_allowed_at: "07:30:00",
        },
        meta: { request_id: "req_oh_4" },
      });

    let resolveSave: ((value: unknown) => void) | undefined;
    updateOperatingHoursMock
      .mockRejectedValueOnce(
        new ApiClientError({
          status: 409,
          code: "OPERATING_HOURS_CONFLICT",
          details: [{ field: "BKG-20261126-001", reason: "Jadwal di luar jam tutup baru." }],
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSave = resolve;
        })
      );

    render(<AdminOperatingHoursView />);

    const opensInput = await screen.findByLabelText(/Jam Buka/i);
    await user.clear(opensInput);
    await user.type(opensInput, "07:00");

    const closesInput = screen.getByLabelText(/Jam Tutup/i);
    await user.clear(closesInput);
    await user.type(closesInput, "18:00");

    await user.type(screen.getByLabelText(/Pembukaan Lebih Awal/i), "07:00");
    await user.type(screen.getByLabelText(/Catatan Perubahan/i), "Layanan pagi lebih awal.");

    await user.click(screen.getByRole("button", { name: "Simpan Konfigurasi" }));
    expect(await screen.findByText("Ringkasan Perubahan")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Ya, Simpan Konfigurasi" });
    await user.click(confirmBtn);

    expect(await screen.findByText("Gagal Menyimpan Konfigurasi")).toBeInTheDocument();
    expect(screen.getByText(/BKG-20261126-001:/i)).toBeInTheDocument();

    await user.click(confirmBtn);
    await user.click(confirmBtn);

    expect(updateOperatingHoursMock).toHaveBeenCalledTimes(2);
    expect(updateOperatingHoursMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      {
        opens_at: "07:00:00",
        closes_at: "18:00:00",
        admin_early_open_at: "07:00:00",
        note: "Layanan pagi lebih awal.",
      }
    );

    resolveSave?.({
      data: {
        service_date: "2026-11-26",
        timezone: "Asia/Jakarta",
        opens_at: "07:00:00",
        closes_at: "18:00:00",
        configured_open_at: "07:00:00",
        early_pickup_allowed_at: "07:30:00",
      },
      meta: { request_id: "req_oh_saved" },
    });

    await waitFor(() => {
      expect(screen.getByText("Jam Operasional Diperbarui")).toBeInTheDocument();
    });
    expect(await screen.findByText("07:30 WIB")).toBeInTheDocument();
  });

  it("pre-fills admin early open and note from server snapshot and renders them in snapshot card", async () => {
    getOperatingHoursMock.mockResolvedValueOnce({
      data: {
        service_date: "2026-11-30",
        timezone: "Asia/Jakarta",
        opens_at: "09:00:00",
        closes_at: "16:00:00",
        configured_open_at: "09:00:00",
        early_pickup_allowed_at: "07:30:00",
        admin_early_open_at: "07:00:00",
        note: "UAT pengujian pembukaan awal ADMIN kedua",
      },
      meta: { request_id: "req_uat_30" },
    });

    render(<AdminOperatingHoursView />);

    // Snapshot card shows early open and note
    expect(await screen.findByText("Pembukaan Awal Khusus ADMIN")).toBeInTheDocument();
    expect(screen.getByText('"UAT pengujian pembukaan awal ADMIN kedua"')).toBeInTheDocument();

    // Form inputs are prefilled with snapshot values
    const earlyInput = screen.getByLabelText(/Pembukaan Lebih Awal/i) as HTMLInputElement;
    expect(earlyInput.value).toBe("07:00");

    const noteInput = screen.getByLabelText(/Catatan Perubahan/i) as HTMLTextAreaElement;
    expect(noteInput.value).toBe("UAT pengujian pembukaan awal ADMIN kedua");
  });
});

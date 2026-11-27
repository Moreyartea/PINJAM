import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAssignmentsView } from "@/features/admin/admin-assignments-view";
import { ApiClientError } from "@/lib/api/errors";

const listAdminApplicationsMock = vi.fn();
const deactivateAssignmentMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    application: {
      listAdminApplications: (...args: unknown[]) => listAdminApplicationsMock(...args),
      deactivateAssignment: (...args: unknown[]) => deactivateAssignmentMock(...args),
    },
  },
}));

describe("AdminAssignmentsView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders contract gap honestly without fetching applications as assignments or bypassing replacement approval", () => {
    render(<AdminAssignmentsView />);

    expect(screen.getByText("Manajemen Assignment Komting")).toBeInTheDocument();
    expect(
      screen.getByText("Daftar Penugasan Komting Menunggu Endpoint Resmi Backend")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Daftar & Detail Assignment Komting Belum Tersedia di API Contract")
    ).toBeInTheDocument();

    // Must never treat /admin/komting/applications as active assignment list
    expect(listAdminApplicationsMock).not.toHaveBeenCalled();

    // Replacement must go through /admin/applications verification, never direct swap button
    expect(
      screen.getByRole("link", { name: "Buka Verifikasi & Pergantian Komting" })
    ).toHaveAttribute("href", "/admin/applications");
    expect(
      screen.queryByRole("button", { name: /ganti langsung|aktifkan lokal|swap/i })
    ).toBeNull();
  });

  it("validates assignmentId and mandatory reason before opening deactivation confirmation", async () => {
    const user = userEvent.setup();
    render(<AdminAssignmentsView />);

    await user.click(screen.getByRole("button", { name: "Nonaktifkan Assignment" }));

    expect(screen.getByText("ID assignment komting wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("Alasan penonaktifan wajib diisi.")).toBeInTheDocument();
    expect(deactivateAssignmentMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/ID Assignment Komting/i), "asgn_if01");
    await user.type(screen.getByLabelText(/Alasan Penonaktifan/i), "ab");
    await user.click(screen.getByRole("button", { name: "Nonaktifkan Assignment" }));

    expect(screen.getByText("Alasan penonaktifan minimal 5 karakter.")).toBeInTheDocument();
    expect(deactivateAssignmentMock).not.toHaveBeenCalled();
  });

  it("confirms deactivation, handles backend errors, prevents double-submit, and resets on success", async () => {
    const user = userEvent.setup();
    let resolveDeactivate: ((value: unknown) => void) | undefined;

    deactivateAssignmentMock
      .mockRejectedValueOnce(
        new ApiClientError({
          status: 403,
          code: "FORBIDDEN",
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDeactivate = resolve;
        })
      );

    render(<AdminAssignmentsView />);

    await user.type(screen.getByLabelText(/ID Assignment Komting/i), "asgn_if01_aktif");
    await user.type(
      screen.getByLabelText(/Alasan Penonaktifan/i),
      "Pergantian pengurus kelas semester baru."
    );
    await user.click(screen.getByRole("button", { name: "Nonaktifkan Assignment" }));

    expect(
      await screen.findByText("Konfirmasi Penonaktifan Assignment Komting")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Booking yang belum diambil akan dibatalkan oleh backend/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya, Nonaktifkan" }));

    expect(await screen.findByText("Penonaktifan Assignment Gagal")).toBeInTheDocument();
    expect(
      screen.getByText("Anda tidak memiliki izin untuk mengakses fitur ini.")
    ).toBeInTheDocument();

    // Retry and verify double-submit guard while request is in-flight
    await user.click(screen.getByRole("button", { name: "Nonaktifkan Assignment" }));
    const confirmBtn = await screen.findByRole("button", { name: "Ya, Nonaktifkan" });
    await user.click(confirmBtn);
    await user.click(confirmBtn);

    expect(deactivateAssignmentMock).toHaveBeenCalledTimes(2);
    expect(deactivateAssignmentMock).toHaveBeenLastCalledWith("asgn_if01_aktif", {
      reason: "Pergantian pengurus kelas semester baru.",
    });

    resolveDeactivate?.({
      data: { success: true },
      meta: { request_id: "req_deact_1" },
    });

    await waitFor(() => {
      expect(screen.getByText("Penonaktifan Assignment Berhasil")).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/ID Assignment Komting/i)).toHaveValue("");
    expect(screen.getByLabelText(/Alasan Penonaktifan/i)).toHaveValue("");
  });
});

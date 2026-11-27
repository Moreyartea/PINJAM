import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminStaffManagementView } from "@/features/admin/admin-staff-management-view";
import { ApiClientError } from "@/lib/api/errors";
import type { UserProfile } from "@/types/domain";

const getMeMock = vi.fn();
const updateMeMock = vi.fn();

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    me: {
      getMe: (...args: unknown[]) => getMeMock(...args),
      updateMe: (...args: unknown[]) => updateMeMock(...args),
    },
  },
}));

const ADMIN_PROFILE: UserProfile = {
  id: "usr_admin_01",
  email: "admin@kampus.ac.id",
  full_name: "Administrator Utama",
  role: "ADMIN",
  account_status: "ACTIVE",
};

describe("AdminStaffManagementView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders contract-gap notice, handles /me loading/error retry, and exposes no ADMIN-role management actions", async () => {
    const user = userEvent.setup();

    getMeMock
      .mockRejectedValueOnce(new ApiClientError({ status: 500, code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce({
        data: ADMIN_PROFILE,
        meta: { request_id: "req_me_1" },
      });

    render(<AdminStaffManagementView />);

    expect(screen.getAllByText("Memuat Profil Pengguna...").length).toBeGreaterThan(0);
    expect(screen.getByText("Pengelolaan Akun Pengguna & STAFF")).toBeInTheDocument();
    expect(
      screen.getByText("Endpoint Manajemen Akun STAFF Belum Tersedia di API Contract")
    ).toBeInTheDocument();
    expect(screen.getByText(/tidak menyediakan pendaftaran mandiri/i)).toBeInTheDocument();

    // Must not provide buttons to create/manage ADMIN accounts or change roles
    expect(
      screen.queryByRole("button", { name: /buat akun|tambah staff|hapus akun|ubah role/i })
    ).toBeNull();

    expect(await screen.findByText("Gagal Memuat Profil Pengguna")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Coba Lagi" }));

    expect(await screen.findByText("usr_admin_01")).toBeInTheDocument();
    expect(screen.getByText("admin@kampus.ac.id")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke Dashboard ADMIN" })).toHaveAttribute(
      "href",
      "/admin"
    );
    expect(screen.getByRole("link", { name: "Buka Operasional STAFF" })).toHaveAttribute(
      "href",
      "/staff"
    );
  });

  it("validates, confirms, handles API errors, and guards double-submit on PATCH /api/v1/me", async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: unknown) => void) | undefined;

    getMeMock
      .mockResolvedValueOnce({
        data: ADMIN_PROFILE,
        meta: { request_id: "req_me_2" },
      })
      .mockResolvedValueOnce({
        data: { ...ADMIN_PROFILE, full_name: "Admin Lab Baru" },
        meta: { request_id: "req_me_3" },
      });

    updateMeMock
      .mockRejectedValueOnce(new ApiClientError({ status: 403, code: "FORBIDDEN" }))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
      );

    render(<AdminStaffManagementView />);

    const nameInput = await screen.findByLabelText(/Nama Lengkap Profil Sendiri/i);
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: "Simpan Nama Profil" }));

    expect(screen.getByText("Nama lengkap wajib diisi.")).toBeInTheDocument();
    expect(updateMeMock).not.toHaveBeenCalled();

    await user.type(nameInput, "Admin Lab Baru");
    await user.click(screen.getByRole("button", { name: "Simpan Nama Profil" }));

    expect(await screen.findByText("Konfirmasi Pembaruan Nama Profil")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya, Perbarui Nama" }));

    expect(await screen.findByText("Gagal Memperbarui Profil")).toBeInTheDocument();
    expect(
      screen.getByText("Anda tidak memiliki izin untuk mengakses fitur ini.")
    ).toBeInTheDocument();

    // Retry while request is pending (double-submit guard)
    await user.click(screen.getByRole("button", { name: "Simpan Nama Profil" }));
    const confirmBtn = await screen.findByRole("button", { name: "Ya, Perbarui Nama" });
    await user.click(confirmBtn);
    await user.click(confirmBtn);

    expect(updateMeMock).toHaveBeenCalledTimes(2);
    expect(updateMeMock).toHaveBeenLastCalledWith({ full_name: "Admin Lab Baru" });

    resolveUpdate?.({
      data: { ...ADMIN_PROFILE, full_name: "Admin Lab Baru" },
      meta: { request_id: "req_me_saved" },
    });

    await waitFor(() => {
      expect(screen.getByText("Profil Diperbarui")).toBeInTheDocument();
    });
  });

  it("references FRONTEND_STAFF_MANAGEMENT_API_GAP.md and explains the contract status", async () => {
    getMeMock.mockResolvedValueOnce({
      data: ADMIN_PROFILE,
      meta: { request_id: "req_me_gap" },
    });

    render(<AdminStaffManagementView />);

    expect(await screen.findByText(/Dokumen Proposal Spesifikasi RFC/i)).toBeInTheDocument();
    expect(screen.getByText(/FRONTEND_STAFF_MANAGEMENT_API_GAP\.md/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Daftar Akun STAFF, Pencarian & Pagination/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Pembuatan & Edit Akun STAFF oleh ADMIN/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Aktivasi, Penonaktifan & Batasan Role/i)).toBeInTheDocument();
  });

  it("handles 422 validation error from backend on updateMe cleanly", async () => {
    const user = userEvent.setup();
    getMeMock.mockResolvedValueOnce({
      data: ADMIN_PROFILE,
      meta: { request_id: "req_me_val" },
    });
    updateMeMock.mockRejectedValueOnce(
      new ApiClientError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: "Nama mengandung karakter terlarang.",
      })
    );

    render(<AdminStaffManagementView />);

    const nameInput = await screen.findByLabelText(/Nama Lengkap Profil Sendiri/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Admin <script>");
    await user.click(screen.getByRole("button", { name: "Simpan Nama Profil" }));

    const confirmBtn = await screen.findByRole("button", { name: "Ya, Perbarui Nama" });
    await user.click(confirmBtn);

    expect(await screen.findByText("Gagal Memperbarui Profil")).toBeInTheDocument();
    expect(screen.getByText("Nama mengandung karakter terlarang.")).toBeInTheDocument();
  });
});

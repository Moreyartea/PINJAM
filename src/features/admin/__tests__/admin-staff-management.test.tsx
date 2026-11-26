import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminStaffManagementView } from "@/features/admin/admin-staff-management-view";

vi.mock("@/services", () => ({
  isMockMode: true,
}));

describe("AdminStaffManagementView", () => {
  it("renders contract-gap notice honestly without inventing STAFF account CRUD forms or endpoints", () => {
    render(<AdminStaffManagementView />);

    expect(screen.getByText("Pengelolaan Akun STAFF")).toBeInTheDocument();
    expect(
      screen.getByText("Endpoint Manajemen Akun STAFF Belum Tersedia di API Contract")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Menunggu Finalisasi API Contract Manajemen STAFF")
    ).toBeInTheDocument();
    expect(screen.getByText(/tidak menyediakan pendaftaran mandiri/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke Dashboard ADMIN" })).toHaveAttribute(
      "href",
      "/admin"
    );
    expect(screen.getByRole("link", { name: "Buka Operasional STAFF" })).toHaveAttribute(
      "href",
      "/staff"
    );
  });
});

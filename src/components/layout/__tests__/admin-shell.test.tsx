import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/components/layout/admin-shell";
import { StaffShell } from "@/components/layout/staff-shell";
import type { UserProfile } from "@/types/domain";

const replaceMock = vi.fn();
let currentUser: UserProfile = {
  id: "admin_1",
  email: "admin@kampus.ac.id",
  full_name: "Administrator Sistem",
  role: "ADMIN",
  account_status: "ACTIVE",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/admin",
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: currentUser,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: vi.fn(),
  }),
}));

describe("AdminShell & Role Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = {
      id: "admin_1",
      email: "admin@kampus.ac.id",
      full_name: "Administrator Sistem",
      role: "ADMIN",
      account_status: "ACTIVE",
    };
  });

  it("renders all required ADMIN navigation links including STAFF operations", () => {
    render(
      <AdminShell>
        <div>Konten Dashboard Admin</div>
      </AdminShell>
    );

    const expectedRoutes = [
      "/admin",
      "/admin/applications",
      "/admin/komting",
      "/admin/staff",
      "/admin/projectors",
      "/admin/operating-hours",
      "/admin/audit-logs",
      "/admin/corrections",
      "/staff",
    ];

    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    for (const route of expectedRoutes) {
      expect(hrefs).toContain(route);
    }

    expect(screen.getByText("Operasional STAFF")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getAllByText("Segera").length).toBeGreaterThanOrEqual(7);
  });

  it("keeps StaffShell isolated without ADMIN routes", () => {
    currentUser = {
      id: "staff_1",
      email: "staff@kampus.ac.id",
      full_name: "Petugas Operasional",
      role: "STAFF",
      account_status: "ACTIVE",
    };

    render(
      <StaffShell>
        <div>Konten Staff</div>
      </StaffShell>
    );

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");

    expect(hrefs).toContain("/staff");
    expect(hrefs.some((href) => href.startsWith("/admin"))).toBe(false);
  });
});

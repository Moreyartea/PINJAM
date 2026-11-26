import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleGuard } from "@/components/auth/role-guard";
import type { UserProfile } from "@/types/domain";

const replaceMock = vi.fn();
let mockPathname = "/komting";
let mockAuth: {
  status: "loading" | "authenticated" | "unauthenticated" | "expired";
  user: UserProfile | null;
} = {
  status: "loading",
  user: null,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => mockPathname,
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    ...mockAuth,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: vi.fn(),
  }),
}));

describe("RoleGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/komting";
  });

  it("does not redirect while session status is loading", () => {
    mockAuth = { status: "loading", user: null };

    render(
      <RoleGuard allowedRoles={["KOMTING"]}>
        <div>Konten Komting</div>
      </RoleGuard>
    );

    expect(screen.getByText("Memvalidasi sesi dan hak akses Anda.")).toBeInTheDocument();
    expect(screen.queryByText("Konten Komting")).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to /login with next parameter", async () => {
    mockAuth = { status: "unauthenticated", user: null };
    mockPathname = "/komting/projectors";

    render(
      <RoleGuard allowedRoles={["KOMTING"]}>
        <div>Konten Komting</div>
      </RoleGuard>
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login?next=%2Fkomting%2Fprojectors");
    });
    expect(screen.queryByText("Konten Komting")).not.toBeInTheDocument();
  });

  it("blocks KOMTING from accessing ADMIN route and redirects to /forbidden", async () => {
    mockPathname = "/admin";
    mockAuth = {
      status: "authenticated",
      user: {
        id: "u1",
        email: "k@kampus.ac.id",
        full_name: "Komting",
        role: "KOMTING",
        account_status: "ACTIVE",
      },
    };

    render(
      <RoleGuard allowedRoles={["ADMIN"]}>
        <div>Admin Panel</div>
      </RoleGuard>
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/forbidden");
    });
    expect(screen.queryByText("Admin Panel")).not.toBeInTheDocument();
  });

  it("renders children when user role is authorized", () => {
    mockAuth = {
      status: "authenticated",
      user: {
        id: "u1",
        email: "k@kampus.ac.id",
        full_name: "Komting",
        role: "KOMTING",
        account_status: "ACTIVE",
      },
    };

    render(
      <RoleGuard allowedRoles={["KOMTING"]}>
        <div>Konten Komting</div>
      </RoleGuard>
    );

    expect(screen.getByText("Konten Komting")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("allows STAFF and ADMIN on operational routes while blocking STAFF from ADMIN routes", async () => {
    mockPathname = "/staff";
    mockAuth = {
      status: "authenticated",
      user: {
        id: "s1",
        email: "staff@kampus.ac.id",
        full_name: "Staff",
        role: "STAFF",
        account_status: "ACTIVE",
      },
    };

    const { rerender } = render(
      <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
        <div>Operasional STAFF</div>
      </RoleGuard>
    );
    expect(screen.getByText("Operasional STAFF")).toBeInTheDocument();

    mockAuth = {
      status: "authenticated",
      user: {
        id: "a1",
        email: "admin@kampus.ac.id",
        full_name: "Admin",
        role: "ADMIN",
        account_status: "ACTIVE",
      },
    };
    rerender(
      <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
        <div>Operasional STAFF</div>
      </RoleGuard>
    );
    expect(screen.getByText("Operasional STAFF")).toBeInTheDocument();

    mockPathname = "/admin";
    mockAuth = {
      status: "authenticated",
      user: {
        id: "s1",
        email: "staff@kampus.ac.id",
        full_name: "Staff",
        role: "STAFF",
        account_status: "ACTIVE",
      },
    };
    rerender(
      <RoleGuard allowedRoles={["ADMIN"]}>
        <div>Admin Only</div>
      </RoleGuard>
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/forbidden");
    });
    expect(screen.queryByText("Admin Only")).not.toBeInTheDocument();
  });

  it("allows ADMIN to access /admin without redirecting", () => {
    mockPathname = "/admin";
    mockAuth = {
      status: "authenticated",
      user: {
        id: "a1",
        email: "admin@kampus.ac.id",
        full_name: "Admin",
        role: "ADMIN",
        account_status: "ACTIVE",
      },
    };

    render(
      <RoleGuard allowedRoles={["ADMIN"]}>
        <div>Dashboard Admin</div>
      </RoleGuard>
    );

    expect(screen.getByText("Dashboard Admin")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

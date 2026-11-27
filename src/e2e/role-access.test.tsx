import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleGuard } from "@/components/auth/role-guard";
import { ApiClientError } from "@/lib/api/errors";
import type { UserProfile } from "@/types/domain";

const replaceMock = vi.fn();
let mockPathname = "/komting";
let mockAuth: {
  status: "loading" | "authenticated" | "unauthenticated" | "expired" | "error";
  user: UserProfile | null;
  error?: ApiClientError | null;
} = {
  status: "authenticated",
  user: null,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => mockPathname,
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    ...mockAuth,
    error: mockAuth.error ?? null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: vi.fn(),
  }),
}));

describe("E2E Skenario Role Access & Guarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("A. Cross-Role Route Protection", () => {
    it("allows KOMTING to access KOMTING route, but blocks access to STAFF and ADMIN routes", async () => {
      mockAuth = {
        status: "authenticated",
        user: {
          id: "u_komting",
          email: "komting@simulasi.local",
          full_name: "Simulasi Komting",
          role: "KOMTING",
          account_status: "ACTIVE",
          komting_assignment: {
            id: "a1",
            class_name: "IF-01",
            status: "ACTIVE",
          },
        },
      };

      // 1. KOMTING accessing KOMTING page -> ALLOWED
      mockPathname = "/komting";
      const { unmount: unmountKomting } = render(
        <RoleGuard allowedRoles={["KOMTING"]}>
          <div>Area Rahasia Komting</div>
        </RoleGuard>
      );
      expect(screen.getByText("Area Rahasia Komting")).toBeInTheDocument();
      unmountKomting();

      // 2. KOMTING accessing STAFF page -> BLOCKED (redirected to /forbidden)
      mockPathname = "/staff";
      const { unmount: unmountStaff } = render(
        <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
          <div>Area Operasional Staff</div>
        </RoleGuard>
      );
      expect(screen.queryByText("Area Operasional Staff")).toBeNull();
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/forbidden");
      });
      unmountStaff();

      // 3. KOMTING accessing ADMIN page -> BLOCKED (redirected to /forbidden)
      mockPathname = "/admin/audit-logs";
      render(
        <RoleGuard allowedRoles={["ADMIN"]}>
          <div>Area Sensitif Admin</div>
        </RoleGuard>
      );
      expect(screen.queryByText("Area Sensitif Admin")).toBeNull();
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/forbidden");
      });
    });

    it("allows STAFF to access STAFF route, but blocks access to ADMIN route", async () => {
      mockAuth = {
        status: "authenticated",
        user: {
          id: "u_staff",
          email: "staff@simulasi.local",
          full_name: "Simulasi Staff",
          role: "STAFF",
          account_status: "ACTIVE",
        },
      };

      // 1. STAFF accessing STAFF page -> ALLOWED
      mockPathname = "/staff/bookings";
      const { unmount: unmountStaff } = render(
        <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
          <div>Daftar Booking Operasional</div>
        </RoleGuard>
      );
      expect(screen.getByText("Daftar Booking Operasional")).toBeInTheDocument();
      unmountStaff();

      // 2. STAFF accessing ADMIN page -> BLOCKED (redirected to /forbidden)
      mockPathname = "/admin/operating-hours";
      render(
        <RoleGuard allowedRoles={["ADMIN"]}>
          <div>Konfigurasi Jam Admin</div>
        </RoleGuard>
      );
      expect(screen.queryByText("Konfigurasi Jam Admin")).toBeNull();
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/forbidden");
      });
    });

    it("allows ADMIN to access both ADMIN and STAFF routes", () => {
      mockAuth = {
        status: "authenticated",
        user: {
          id: "u_admin",
          email: "admin@simulasi.local",
          full_name: "Simulasi Admin",
          role: "ADMIN",
          account_status: "ACTIVE",
        },
      };

      // 1. ADMIN accessing ADMIN page -> ALLOWED
      mockPathname = "/admin/projectors";
      const { unmount: unmountAdmin } = render(
        <RoleGuard allowedRoles={["ADMIN"]}>
          <div>Kelola Proyektor Admin</div>
        </RoleGuard>
      );
      expect(screen.getByText("Kelola Proyektor Admin")).toBeInTheDocument();
      unmountAdmin();

      // 2. ADMIN accessing STAFF page -> ALLOWED
      mockPathname = "/staff/scan";
      render(
        <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
          <div>Scan QR Staff/Admin</div>
        </RoleGuard>
      );
      expect(screen.getByText("Scan QR Staff/Admin")).toBeInTheDocument();
    });
  });

  describe("B. Unauthenticated & Session Protection", () => {
    it("redirects unauthenticated user to /login with encoded next path", async () => {
      mockAuth = { status: "unauthenticated", user: null };
      mockPathname = "/komting/bookings/new";

      render(
        <RoleGuard allowedRoles={["KOMTING"]}>
          <div>Form Booking Baru</div>
        </RoleGuard>
      );

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/login?next=%2Fkomting%2Fbookings%2Fnew");
      });
      expect(screen.queryByText("Form Booking Baru")).toBeNull();
    });

    it("displays session error state cleanly without confusing it with voluntary logout", async () => {
      mockAuth = {
        status: "error",
        user: null,
        error: new ApiClientError({
          status: 500,
          code: "SESSION_FETCH_ERROR",
          message: "Gagal menyinkronkan profil pengguna dari server.",
        }),
      };
      mockPathname = "/admin";

      render(
        <RoleGuard allowedRoles={["ADMIN"]}>
          <div>Dashboard Admin</div>
        </RoleGuard>
      );

      expect(await screen.findByText("Gagal Memuat Profil")).toBeInTheDocument();
      expect(
        screen.getByText("Gagal menyinkronkan profil pengguna dari server.")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Coba Lagi" })).toBeInTheDocument();
      // Pastikan tidak me-redirect paksa seolah-olah user logout
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });
});

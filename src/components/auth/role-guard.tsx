"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LoadingState } from "@/components/feedback/loading-state";
import { useAuth } from "@/lib/auth/auth-context";
import { isRoleAllowed } from "@/lib/auth/navigation";
import type { UserRole } from "@/types/domain";

export interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: ReactNode;
  loadingTitle?: string;
}

/**
 * Client-side UX route guard based on /api/v1/me profile.
 * IMPORTANT: Frontend RoleGuard is never a replacement for server/database authorization.
 */
export function RoleGuard({
  allowedRoles,
  children,
  loadingTitle = "Memeriksa sesi pengguna...",
}: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user } = useAuth();

  const isAuthenticated = status === "authenticated" && user !== null;
  const isAuthorized = isAuthenticated && isRoleAllowed(user.role, allowedRoles);

  useEffect(() => {
    // Never redirect while session bootstrap is still loading.
    if (status === "loading") return;

    if (status === "unauthenticated" || status === "expired" || !user) {
      const nextParam = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${nextParam}`);
      return;
    }

    if (!isRoleAllowed(user.role, allowedRoles)) {
      router.replace("/forbidden");
    }
  }, [status, user, allowedRoles, pathname, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg)]">
        <div className="w-full max-w-md">
          <LoadingState
            title={loadingTitle}
            description="Memvalidasi sesi dan hak akses Anda."
            rows={2}
          />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg)]">
        <div className="w-full max-w-md">
          <LoadingState
            title="Mengalihkan halaman..."
            description="Menyesuaikan rute dengan status sesi dan role Anda."
            rows={2}
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

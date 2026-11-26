"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard ADMIN", href: "/admin" },
  { label: "Pengajuan Komting", href: "/admin/applications" },
  { label: "Assignment Komting", href: "/admin/komting", badge: "Segera" },
  { label: "Akun STAFF", href: "/admin/staff", badge: "Segera" },
  { label: "Inventaris Proyektor", href: "/admin/projectors" },
  { label: "Jam Operasional", href: "/admin/operating-hours", badge: "Segera" },
  { label: "Audit Log", href: "/admin/audit-logs", badge: "Segera" },
  { label: "Koreksi Transaksi", href: "/admin/corrections", badge: "Segera" },
  { label: "Operasional STAFF", href: "/staff", badge: "STAFF" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <AppShell
      navItems={ADMIN_NAV_ITEMS}
      roleLabel={user?.role ?? "ADMIN"}
      userLabel={user?.full_name}
      headerActions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          isLoading={signingOut}
          loadingText="Keluar..."
        >
          Keluar
        </Button>
      }
    >
      {children}
    </AppShell>
  );
}

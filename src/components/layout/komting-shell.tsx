"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

const KOMTING_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/komting" },
  { label: "Daftar Proyektor", href: "/komting/projectors" },
  { label: "Booking Baru", href: "/komting/bookings/new" },
  { label: "Daftar Booking", href: "/komting/bookings" },
  { label: "Riwayat Peminjaman", href: "/komting/loans" },
  { label: "Status Pengajuan", href: "/application/status" },
];

export function KomtingShell({ children }: { children: ReactNode }) {
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
      navItems={KOMTING_NAV_ITEMS}
      roleLabel={user?.role ?? "KOMTING"}
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

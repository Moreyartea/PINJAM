"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

const STAFF_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard STAFF", href: "/staff" },
  { label: "Scan QR", href: "/staff/scan" },
  { label: "Booking Operasional", href: "/staff/bookings" },
  { label: "Daftar Loan", href: "/staff/loans" },
  { label: "Maintenance & Unit", href: "/staff/maintenance" },
];

export function StaffShell({ children }: { children: ReactNode }) {
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
      navItems={STAFF_NAV_ITEMS}
      roleLabel={user?.role ?? "STAFF"}
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

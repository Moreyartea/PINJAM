import { RoleGuard } from "@/components/auth/role-guard";
import { KomtingShell } from "@/components/layout/komting-shell";
import { KomtingDashboardView } from "@/features/komting/komting-dashboard-view";

export default function KomtingDashboardPage() {
  return (
    <RoleGuard allowedRoles={["KOMTING"]}>
      <KomtingShell>
        <KomtingDashboardView />
      </KomtingShell>
    </RoleGuard>
  );
}

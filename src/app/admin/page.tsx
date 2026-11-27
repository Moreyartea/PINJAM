import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminDashboardView } from "@/features/admin/admin-dashboard-view";

export default function AdminDashboardPage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminDashboardView />
      </AdminShell>
    </RoleGuard>
  );
}

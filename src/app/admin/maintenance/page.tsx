import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminMaintenanceView } from "@/features/admin/admin-maintenance-view";

export default function AdminMaintenancePage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminMaintenanceView />
      </AdminShell>
    </RoleGuard>
  );
}

import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminStaffManagementView } from "@/features/admin/admin-staff-management-view";

export default function AdminStaffPage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminStaffManagementView />
      </AdminShell>
    </RoleGuard>
  );
}

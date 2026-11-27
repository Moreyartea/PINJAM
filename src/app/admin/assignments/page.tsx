import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminAssignmentsView } from "@/features/admin/admin-assignments-view";

export default function AdminAssignmentsPage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminAssignmentsView />
      </AdminShell>
    </RoleGuard>
  );
}

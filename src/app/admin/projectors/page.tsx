import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminProjectorsListView } from "@/features/admin/admin-projectors-list-view";

export default function AdminProjectorsPage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminProjectorsListView />
      </AdminShell>
    </RoleGuard>
  );
}

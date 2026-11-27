import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminApplicationsListView } from "@/features/admin/admin-applications-list-view";

export default function AdminApplicationsPage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminApplicationsListView />
      </AdminShell>
    </RoleGuard>
  );
}

import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminAuditLogsListView } from "@/features/admin/admin-audit-logs-list-view";

export default function AdminAuditLogsPage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminAuditLogsListView />
      </AdminShell>
    </RoleGuard>
  );
}

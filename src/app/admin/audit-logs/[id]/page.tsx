import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminAuditLogDetailView } from "@/features/admin/admin-audit-log-detail-view";

export default async function AdminAuditLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminAuditLogDetailView auditLogId={decodeURIComponent(id)} />
      </AdminShell>
    </RoleGuard>
  );
}

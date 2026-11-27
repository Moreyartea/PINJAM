import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminApplicationDetailView } from "@/features/admin/admin-application-detail-view";

export default async function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminApplicationDetailView applicationId={decodeURIComponent(id)} />
      </AdminShell>
    </RoleGuard>
  );
}

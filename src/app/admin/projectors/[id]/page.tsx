import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminProjectorDetailView } from "@/features/admin/admin-projector-detail-view";

export default async function AdminProjectorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminProjectorDetailView projectorId={decodeURIComponent(id)} />
      </AdminShell>
    </RoleGuard>
  );
}

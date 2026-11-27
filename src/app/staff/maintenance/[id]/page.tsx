import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffMaintenanceDetailView } from "@/features/staff/staff-maintenance-detail-view";

export default async function StaffMaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffMaintenanceDetailView maintenanceId={decodeURIComponent(id)} />
      </StaffShell>
    </RoleGuard>
  );
}

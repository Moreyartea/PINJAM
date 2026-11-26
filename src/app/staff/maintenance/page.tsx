import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffMaintenanceView } from "@/features/staff/staff-maintenance-view";

export default function StaffMaintenancePage() {
  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffMaintenanceView />
      </StaffShell>
    </RoleGuard>
  );
}

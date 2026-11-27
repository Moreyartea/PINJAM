import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffDashboardView } from "@/features/staff/staff-dashboard-view";

export default function StaffDashboardPage() {
  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffDashboardView />
      </StaffShell>
    </RoleGuard>
  );
}

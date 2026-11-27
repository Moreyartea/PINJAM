import { RoleGuard } from "@/components/auth/role-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminOperatingHoursView } from "@/features/admin/admin-operating-hours-view";

export default function AdminOperatingHoursPage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <AdminOperatingHoursView />
      </AdminShell>
    </RoleGuard>
  );
}

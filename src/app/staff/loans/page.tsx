import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffLoanListView } from "@/features/staff/staff-loan-list-view";

export default function StaffLoansPage() {
  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffLoanListView />
      </StaffShell>
    </RoleGuard>
  );
}

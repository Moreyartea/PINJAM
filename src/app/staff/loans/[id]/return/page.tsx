import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffReturnInspectionView } from "@/features/staff/staff-return-inspection-view";

export default async function StaffLoanReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffReturnInspectionView loanId={decodeURIComponent(id)} />
      </StaffShell>
    </RoleGuard>
  );
}

import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffLoanDetailView } from "@/features/staff/staff-loan-detail-view";

interface StaffLoanDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffLoanDetailPage({ params }: StaffLoanDetailPageProps) {
  const { id } = await params;

  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffLoanDetailView loanId={id} />
      </StaffShell>
    </RoleGuard>
  );
}

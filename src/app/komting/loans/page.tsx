import { RoleGuard } from "@/components/auth/role-guard";
import { KomtingShell } from "@/components/layout/komting-shell";
import { KomtingLoanHistoryView } from "@/features/loans/komting-loan-history-view";

export default function KomtingLoansPage() {
  return (
    <RoleGuard allowedRoles={["KOMTING"]}>
      <KomtingShell>
        <KomtingLoanHistoryView />
      </KomtingShell>
    </RoleGuard>
  );
}

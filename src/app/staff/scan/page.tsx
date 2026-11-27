import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffQrScanView } from "@/features/staff/staff-qr-scan-view";

export default function StaffScanPage() {
  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffQrScanView />
      </StaffShell>
    </RoleGuard>
  );
}

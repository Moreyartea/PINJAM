import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffBookingListView } from "@/features/staff/staff-booking-list-view";

export default function StaffBookingsPage() {
  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffBookingListView />
      </StaffShell>
    </RoleGuard>
  );
}

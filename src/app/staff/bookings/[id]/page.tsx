import { RoleGuard } from "@/components/auth/role-guard";
import { StaffShell } from "@/components/layout/staff-shell";
import { StaffBookingDetailView } from "@/features/staff/staff-booking-detail-view";

export default async function StaffBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RoleGuard allowedRoles={["STAFF", "ADMIN"]}>
      <StaffShell>
        <StaffBookingDetailView bookingId={decodeURIComponent(id)} />
      </StaffShell>
    </RoleGuard>
  );
}

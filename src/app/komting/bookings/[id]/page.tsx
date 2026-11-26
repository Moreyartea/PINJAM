import { RoleGuard } from "@/components/auth/role-guard";
import { KomtingShell } from "@/components/layout/komting-shell";
import { BookingDetailView } from "@/features/bookings/booking-detail-view";

export default async function KomtingBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RoleGuard allowedRoles={["KOMTING"]}>
      <KomtingShell>
        <BookingDetailView bookingId={decodeURIComponent(id)} />
      </KomtingShell>
    </RoleGuard>
  );
}

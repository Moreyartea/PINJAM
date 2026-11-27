import { RoleGuard } from "@/components/auth/role-guard";
import { KomtingShell } from "@/components/layout/komting-shell";
import { BookingListView } from "@/features/bookings/booking-list-view";

export default function KomtingBookingsPage() {
  return (
    <RoleGuard allowedRoles={["KOMTING"]}>
      <KomtingShell>
        <BookingListView />
      </KomtingShell>
    </RoleGuard>
  );
}

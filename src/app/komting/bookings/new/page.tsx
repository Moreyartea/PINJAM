import { Suspense } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { LoadingState } from "@/components/feedback/loading-state";
import { KomtingShell } from "@/components/layout/komting-shell";
import { NewBookingForm } from "@/features/bookings/new-booking-form";

export default function NewBookingPage() {
  return (
    <RoleGuard allowedRoles={["KOMTING"]}>
      <KomtingShell>
        <Suspense
          fallback={
            <LoadingState
              title="Memuat Form Booking..."
              description="Menyiapkan daftar proyektor dan jam operasional."
              rows={3}
            />
          }
        >
          <NewBookingForm />
        </Suspense>
      </KomtingShell>
    </RoleGuard>
  );
}

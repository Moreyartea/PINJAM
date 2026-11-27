import "server-only";

import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  listKomtingBookings,
  type BookingServiceDeps,
} from "@/lib/bookings/booking-service";
import {
  listKomtingLoans,
  type LoanServiceDeps,
} from "@/lib/loans/loan-service";
import {
  listProjectors,
  type ProjectorServiceDeps,
} from "@/lib/projectors/projector-service";
import type { DashboardReminder, KomtingDashboardSummary } from "@/types/domain";

export interface KomtingDashboardServiceDeps {
  bookingServiceDeps?: BookingServiceDeps;
  loanServiceDeps?: LoanServiceDeps;
  projectorServiceDeps?: ProjectorServiceDeps;
}

export async function getKomtingDashboardData(
  context: AuthenticatedUserContext,
  deps: KomtingDashboardServiceDeps = {}
): Promise<KomtingDashboardSummary> {
  const [confirmedBookingsResult, recentBookingsResult, activeLoansResult, projectorsResult] =
    await Promise.all([
      listKomtingBookings(
        context,
        "http://internal/api/v1/komting/bookings?status=CONFIRMED&page=1&page_size=1",
        deps.bookingServiceDeps
      ),
      listKomtingBookings(
        context,
        "http://internal/api/v1/komting/bookings?page=1&page_size=5",
        deps.bookingServiceDeps
      ),
      listKomtingLoans(
        context,
        "http://internal/api/v1/komting/loans?status=ACTIVE&page=1&page_size=1",
        deps.loanServiceDeps
      ),
      listProjectors(
        context,
        "http://internal/api/v1/projectors?is_active=true&page=1&page_size=4",
        deps.projectorServiceDeps
      ),
    ]);

  const activeBooking = confirmedBookingsResult.items[0] ?? null;
  const activeLoan = activeLoansResult.items[0] ?? null;
  const recentBookings = recentBookingsResult.items;
  const relevantProjectors = projectorsResult.items;

  const reminders: DashboardReminder[] = [];

  if (!context.komtingAssignment || context.komtingAssignment.status !== "ACTIVE") {
    reminders.push({
      id: "rem_assignment_inactive",
      level: "warning",
      message: "Penugasan komting belum aktif. Anda belum dapat mengajukan booking proyektor baru.",
    });
  }

  if (activeLoan) {
    reminders.push({
      id: "rem_active_loan",
      level: "info",
      message: "Anda sedang memiliki peminjaman aktif. Harap kembalikan unit proyektor tepat waktu ke staf.",
    });
  } else if (activeBooking) {
    reminders.push({
      id: "rem_active_booking",
      level: "info",
      message: `Anda memiliki booking aktif (${activeBooking.booking_code}). Pengambilan proyektor dapat dilakukan pada jendela pickup.`,
    });
  }

  return {
    active_assignment: context.komtingAssignment ?? null,
    active_booking: activeBooking,
    active_loan: activeLoan,
    recent_bookings: recentBookings,
    relevant_projectors: relevantProjectors,
    reminders,
  };
}

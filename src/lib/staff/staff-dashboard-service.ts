import "server-only";

import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  createSupabaseBookingRepository,
  type BookingRepository,
} from "@/lib/bookings/booking-service";
import {
  createSupabaseLoanRepository,
  type LoanRepository,
} from "@/lib/loans/loan-service";
import {
  createSupabaseProjectorRepository,
  type ProjectorRepository,
} from "@/lib/projectors/projector-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getJakartaNowParts } from "@/lib/utils/jakarta-time";
import type {
  Booking,
  Loan,
  Projector,
  StaffActivityItem,
  StaffDashboardSummary,
} from "@/types/domain";

export interface StaffDashboardServiceDeps {
  bookingRepo?: BookingRepository;
  loanRepo?: LoanRepository;
  projectorRepo?: ProjectorRepository;
  adminClient?: ReturnType<typeof createSupabaseAdminClient>;
  nowProvider?: () => Date;
}

function formatAuditActionMessage(action: string, entityType: string): string {
  switch (action) {
    case "BOOKING_CREATED":
      return "Pemesanan proyektor baru berhasil dibuat oleh Komting.";
    case "BOOKING_CANCELLED":
      return "Pemesanan proyektor telah dibatalkan.";
    case "LOAN_PICKUP_CONFIRMED":
      return "Serah-terima unit proyektor (pickup) telah dikonfirmasi oleh staf.";
    case "LOAN_RETURN_CONFIRMED":
      return "Pengembalian unit proyektor (return) telah diselesaikan.";
    case "LOAN_INSPECTED":
      return "Inspeksi fisik kelengkapan unit telah dicatat oleh staf.";
    case "LOAN_FINE_RECORDED":
      return "Pencatatan denda/kompensasi unit telah diterbitkan.";
    case "PROJECTOR_DEACTIVATED":
      return "Unit proyektor dinonaktifkan oleh administrator.";
    case "PROJECTOR_MAINTENANCE":
      return "Unit proyektor dialihkan ke status maintenance.";
    default:
      return `Aktivitas operasional: ${action.replace(/_/g, " ").toLowerCase()} pada ${entityType.toLowerCase()}.`;
  }
}

export async function getStaffDashboardData(
  context: AuthenticatedUserContext,
  deps: StaffDashboardServiceDeps = {}
): Promise<StaffDashboardSummary> {
  const now = deps.nowProvider ? deps.nowProvider() : new Date();
  const nowIso = now.toISOString();
  const today = getJakartaNowParts(now).today;

  const bookingRepo = deps.bookingRepo ?? createSupabaseBookingRepository();
  const loanRepo = deps.loanRepo ?? createSupabaseLoanRepository();
  const projectorRepo = deps.projectorRepo ?? createSupabaseProjectorRepository();
  const admin = deps.adminClient ?? createSupabaseAdminClient();

  // Run independent queries in parallel via Promise.all
  const [
    pendingPickupsResult,
    bookingsTodayResult,
    activeLoansResult,
    overdueLoansQueryResult,
    maintenanceResult,
    recentAuditLogsResult,
  ] = await Promise.all([
    // 1. Pending pickups: bookings waiting for handover (status CONFIRMED)
    bookingRepo.listStaffBookings({
      status: "CONFIRMED",
      page: 1,
      pageSize: 20,
    }),

    // 2. Bookings scheduled for today
    bookingRepo.listStaffBookings({
      date: today,
      page: 1,
      pageSize: 1,
    }),

    // 3. Active loans currently borrowed
    loanRepo.listStaffLoans({
      status: "ACTIVE",
      page: 1,
      pageSize: 20,
    }),

    // 4. Overdue check: active loans where estimated_return_at < nowIso
    admin
      .from("loans")
      .select("id, bookings!loans_booking_id_fkey(estimated_return_at)")
      .eq("status", "ACTIVE")
      .then(
        ({ data, error }) => ({ data: error ? null : data }),
        () => ({ data: null })
      ),

    // 5. Maintenance units currently in repair or maintenance
    projectorRepo.listProjectors({
      physicalStatus: "MAINTENANCE",
      page: 1,
      pageSize: 50,
      sortBy: "asset_code",
      sortOrder: "asc",
    }),

    // 6. Recent operational activities from audit logs
    admin
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, created_at, actor_role")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(
        ({ data, error }) => ({ data: error ? null : data }),
        () => ({ data: null })
      ),
  ]);

  // Calculate overdue loans count
  let overdueLoansCount = 0;
  if (Array.isArray(overdueLoansQueryResult?.data)) {
    for (const item of overdueLoansQueryResult.data) {
      const bkg = item.bookings as unknown as { estimated_return_at?: string } | null;
      if (bkg?.estimated_return_at && bkg.estimated_return_at < nowIso) {
        overdueLoansCount += 1;
      }
    }
  }

  // Format recent activities
  const recentActivities: StaffActivityItem[] = [];
  if (Array.isArray(recentAuditLogsResult?.data)) {
    for (const log of recentAuditLogsResult.data) {
      recentActivities.push({
        id: log.id,
        message: formatAuditActionMessage(log.action, log.entity_type),
        timestamp: log.created_at,
      });
    }
  }

  return {
    bookings_today_count: bookingsTodayResult.totalItems,
    pending_pickup_count: pendingPickupsResult.totalItems,
    active_loans_count: activeLoansResult.totalItems,
    overdue_loans_count: overdueLoansCount,
    maintenance_units_count: maintenanceResult.totalItems,
    pending_pickups: pendingPickupsResult.items as Booking[],
    active_loans: activeLoansResult.items as Loan[],
    maintenance_units: maintenanceResult.items as Projector[],
    recent_activities: recentActivities,
  };
}

/**
 * Domain types and enums aligned with API_CONTRACT_PINJAM.md & FRONTEND_SPEC_PINJAM.md §13.
 * Never invent backend business truths from these client types.
 */

export type UserRole = "KOMTING" | "STAFF" | "ADMIN";

export type AccountStatus = "PENDING_VERIFICATION" | "ACTIVE" | "REJECTED" | "INACTIVE";

export type ApplicationStatus =
  | "PENDING_EMAIL_VERIFICATION"
  | "PENDING_VERIFICATION"
  | "PENDING_REVIEW"
  | "PENDING_REPLACEMENT_NOTICE"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

export type AssignmentStatus = "ACTIVE" | "INACTIVE" | "REPLACED";

export type ProjectorPhysicalStatus = "AVAILABLE" | "BORROWED" | "MAINTENANCE" | "INACTIVE";

export type BookingStatus = "CONFIRMED" | "FULFILLED" | "CANCELLED" | "EXPIRED";

export type LoanStatus = "ACTIVE" | "RETURNED";

export type ProjectorCondition = "NORMAL" | "DAMAGED";

export type AccessoriesCondition = "COMPLETE" | "INCOMPLETE";

export type UnitDisposition = "AVAILABLE" | "MAINTENANCE";

export type MaintenanceStatus = "IN_PROGRESS" | "COMPLETED";

export type HandoverActorType = "KOMTING" | "REPRESENTATIVE";

export type QRActionType = "PICKUP" | "RETURN";

export interface KomtingAssignmentSummary {
  id: string;
  user_id?: string;
  class_name: string;
  status: AssignmentStatus | string;
  started_at?: string;
  ended_at?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  account_status: AccountStatus | string;
  created_at?: string;
  komting_assignment?: KomtingAssignmentSummary | null;
}

export interface Projector {
  id: string;
  asset_code: string;
  name: string;
  brand: string | null;
  model: string | null;
  physical_status: ProjectorPhysicalStatus | string;
  is_active: boolean;
}

export interface PickupWindow {
  opens_at: string;
  closes_at: string;
}

export interface Booking {
  id: string;
  booking_code: string;
  komting_id: string;
  projector_id: string;
  booking_date: string;
  start_time: string;
  estimated_return_at: string;
  status: BookingStatus | string;
  pickup_window: PickupWindow;
  created_at: string;
}

export interface Loan {
  id: string;
  booking_id: string;
  projector_id: string;
  komting_id: string;
  status: LoanStatus | string;
  picked_up_at: string;
  returned_at: string | null;
  return_condition: ProjectorCondition | string | null;
}

export interface ReturnInspection {
  projector_condition: ProjectorCondition | string;
  accessories_condition: AccessoriesCondition | string;
  note: string | null;
  photo_url: string | null;
  unit_disposition: UnitDisposition | string;
}

export interface OperatingHoursSnapshot {
  service_date?: string;
  timezone?: string;
  opens_at: string;
  closes_at: string;
  configured_open_at?: string;
  early_pickup_allowed_at: string;
}

export interface AvailabilityResult {
  projector_id: string;
  date: string;
  is_bookable: boolean;
  physical_status: ProjectorPhysicalStatus | string;
  operating_hours: OperatingHoursSnapshot;
  message: string | null;
}

export interface KomtingApplication {
  application_id: string;
  full_name?: string;
  email?: string;
  student_id?: string;
  class_name?: string;
  application_type?: "NEW" | "REPLACEMENT" | string;
  status: ApplicationStatus | string;
  submitted_at: string;
  admin_note?: string | null;
  rejection_reason?: string | null;
}

export interface MaintenanceRecord {
  id: string;
  projector_id: string;
  reason: string;
  note: string | null;
  status: MaintenanceStatus | string;
  started_at: string;
  resolution_note: string | null;
  completed_at: string | null;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  actor_role: UserRole | string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string | null;
  request_id: string;
  created_at: string;
}

export interface DashboardReminder {
  id?: string;
  message: string;
  level?: "info" | "warning";
}

export interface KomtingDashboardSummary {
  active_assignment: KomtingAssignmentSummary | null;
  active_booking: Booking | null;
  active_loan: Loan | null;
  recent_bookings?: Booking[];
  relevant_projectors?: Projector[];
  reminders?: DashboardReminder[];
}

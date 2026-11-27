import type {
  ApiActionResult,
  ApiListResponse,
  ApiSingleResponse,
  ListQueryParams,
} from "@/lib/api/types";
import type {
  AuditLogEntry,
  AvailabilityResult,
  Booking,
  BookingStatus,
  HandoverActorType,
  KomtingApplication,
  KomtingDashboardSummary,
  Loan,
  LoanStatus,
  MaintenanceRecord,
  MaintenanceStatus,
  OperatingHoursSnapshot,
  Projector,
  ProjectorPhysicalStatus,
  QRActionType,
  ReturnInspection,
  StaffDashboardSummary,
  UserProfile,
} from "@/types/domain";

export interface AuthSession {
  access_token: string;
  expires_at?: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface EmailVerificationParams {
  token?: string;
  token_hash?: string;
  type?: string;
}

export interface EmailVerificationResult {
  verified: boolean;
  message: string;
}

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  signInWithPassword(credentials: AuthCredentials): Promise<AuthSession>;
  verifyEmail(params: EmailVerificationParams): Promise<EmailVerificationResult>;
  signOut(): Promise<void>;
}

export interface MeService {
  getMe(): Promise<ApiSingleResponse<UserProfile>>;
  updateMe(payload: { full_name: string }): Promise<ApiSingleResponse<UserProfile>>;
}

export interface ApplicationService {
  submitApplication(formData: FormData): Promise<
    ApiSingleResponse<{
      application_id: string;
      status: string;
      submitted_at: string;
    }>
  >;
  getMyApplication(): Promise<ApiSingleResponse<KomtingApplication>>;
  listAdminApplications(
    params?: ListQueryParams & { status?: string }
  ): Promise<ApiListResponse<KomtingApplication>>;
  getAdminApplication(applicationId: string): Promise<ApiSingleResponse<KomtingApplication>>;
  approveApplication(
    applicationId: string,
    payload: { admin_note?: string | null }
  ): Promise<
    ApiSingleResponse<{
      application_id: string;
      status: string;
      assignment: { id: string; status: string; class_name: string };
    }>
  >;
  rejectApplication(
    applicationId: string,
    payload: { reason: string }
  ): Promise<ApiSingleResponse<KomtingApplication>>;
  approveReplacement(
    applicationId: string,
    payload: { admin_note?: string | null },
    idempotencyKey: string
  ): Promise<
    ApiSingleResponse<{
      application_id: string;
      status: string;
      assignment: { id: string; status: string; class_name: string };
    }>
  >;
  deactivateAssignment(
    assignmentId: string,
    payload: { reason: string }
  ): Promise<ApiSingleResponse<ApiActionResult>>;
}

export interface ProjectorService {
  listProjectors(
    params?: ListQueryParams & { physical_status?: ProjectorPhysicalStatus }
  ): Promise<ApiListResponse<Projector>>;
  getProjector(projectorId: string): Promise<ApiSingleResponse<Projector>>;
  createProjector(payload: {
    asset_code: string;
    name: string;
    brand?: string | null;
    model?: string | null;
  }): Promise<ApiSingleResponse<Projector>>;
  updateProjector(
    projectorId: string,
    payload: Partial<Pick<Projector, "name" | "brand" | "model">>
  ): Promise<ApiSingleResponse<Projector>>;
  deactivateProjector(projectorId: string): Promise<ApiSingleResponse<Projector>>;
}

export interface AvailabilityCheckParams {
  projector_id: string;
  date: string;
  start_time?: string;
  estimated_return_at?: string;
}

export interface AvailabilityService {
  checkAvailability(
    params: AvailabilityCheckParams
  ): Promise<ApiSingleResponse<AvailabilityResult>>;
}

export interface CreateBookingPayload {
  projector_id: string;
  booking_date: string;
  start_time: string;
  estimated_return_at: string;
}

export interface BookingService {
  createBooking(
    payload: CreateBookingPayload,
    idempotencyKey: string
  ): Promise<ApiSingleResponse<Booking>>;
  listKomtingBookings(
    params?: ListQueryParams & { status?: BookingStatus }
  ): Promise<ApiListResponse<Booking>>;
  getKomtingBooking(bookingId: string): Promise<ApiSingleResponse<Booking>>;
  cancelKomtingBooking(
    bookingId: string,
    payload: { reason: string }
  ): Promise<ApiSingleResponse<Booking>>;
  listStaffBookings(
    params?: ListQueryParams & { date?: string; status?: BookingStatus }
  ): Promise<ApiListResponse<Booking>>;
  getStaffBooking(bookingId: string): Promise<ApiSingleResponse<Booking>>;
}

export interface LoanService {
  listStaffLoans(
    params?: ListQueryParams & { status?: LoanStatus }
  ): Promise<ApiListResponse<Loan>>;
  getStaffLoan(loanId: string): Promise<ApiSingleResponse<Loan>>;
  confirmReturn(
    loanId: string,
    formData: FormData,
    idempotencyKey: string
  ): Promise<
    ApiSingleResponse<{
      loan: Pick<Loan, "id" | "status" | "returned_at">;
      inspection: Pick<
        ReturnInspection,
        "projector_condition" | "accessories_condition" | "unit_disposition"
      >;
      projector: Pick<Projector, "id" | "physical_status">;
    }>
  >;
  listKomtingLoans(
    params?: ListQueryParams & { status?: LoanStatus }
  ): Promise<ApiListResponse<Loan>>;
}

export interface QrValidationResponse {
  valid: boolean;
  action: QRActionType;
  transaction: {
    booking_id: string;
    booking_code: string;
    komting_name: string;
    class_name: string;
    projector_name: string;
    status: string;
  };
  requires_confirmation: boolean;
}

export interface ConfirmPickupPayload {
  qr_payload: string;
  confirmed: true;
  received_by: HandoverActorType;
  representative_name: string | null;
  note: string | null;
}

export interface QrService {
  getBookingQr(bookingId: string): Promise<
    ApiSingleResponse<{
      qr_payload: string;
      expires_at: string;
    }>
  >;
  validateQr(payload: {
    qr_payload: string;
    action: QRActionType;
  }): Promise<ApiSingleResponse<QrValidationResponse>>;
  confirmPickup(
    bookingId: string,
    payload: ConfirmPickupPayload,
    idempotencyKey: string
  ): Promise<
    ApiSingleResponse<{
      booking: Pick<Booking, "id" | "status">;
      loan: Pick<Loan, "id" | "status" | "picked_up_at">;
      projector: Pick<Projector, "id" | "physical_status">;
    }>
  >;
}

export interface MaintenanceService {
  listMaintenance(
    params?: ListQueryParams & { status?: MaintenanceStatus }
  ): Promise<ApiListResponse<MaintenanceRecord>>;
  createMaintenance(
    projectorId: string,
    payload: { reason: string; note?: string | null }
  ): Promise<ApiSingleResponse<MaintenanceRecord>>;
  completeMaintenance(
    maintenanceId: string,
    payload: { resolution_note: string; set_projector_available: boolean }
  ): Promise<ApiSingleResponse<MaintenanceRecord>>;
}

export interface OperatingHoursService {
  getOperatingHours(date: string): Promise<ApiSingleResponse<OperatingHoursSnapshot>>;
  updateOperatingHours(
    date: string,
    payload: {
      opens_at: string;
      closes_at: string;
      admin_early_open_at: string | null;
      note: string | null;
    }
  ): Promise<ApiSingleResponse<OperatingHoursSnapshot>>;
}

export interface AdminService {
  getKomtingDashboard(): Promise<ApiSingleResponse<KomtingDashboardSummary>>;
  getStaffDashboard(): Promise<ApiSingleResponse<StaffDashboardSummary>>;
  correctTransaction(
    transactionId: string,
    payload: {
      reason: string;
      correction: { field: string; new_value: unknown };
    }
  ): Promise<ApiSingleResponse<ApiActionResult>>;
}

export interface AuditLogService {
  listAuditLogs(
    params?: ListQueryParams & { entity_type?: string; entity_id?: string }
  ): Promise<ApiListResponse<AuditLogEntry>>;
  getAuditLog(auditLogId: string): Promise<ApiSingleResponse<AuditLogEntry>>;
}

export interface ServiceRegistry {
  auth: AuthService;
  me: MeService;
  application: ApplicationService;
  projector: ProjectorService;
  availability: AvailabilityService;
  booking: BookingService;
  loan: LoanService;
  qr: QrService;
  maintenance: MaintenanceService;
  operatingHours: OperatingHoursService;
  admin: AdminService;
  auditLog: AuditLogService;
}

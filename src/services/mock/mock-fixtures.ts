import type {
  AuditLogEntry,
  Booking,
  KomtingApplication,
  KomtingDashboardSummary,
  Loan,
  MaintenanceRecord,
  Projector,
  UserProfile,
} from "@/types/domain";

export type MockAccountKey =
  "komting_active" | "komting_pending" | "komting_inactive" | "staff" | "admin";

/**
 * Development-only simulation fixtures matching API_CONTRACT_PINJAM.md shapes.
 * Strictly NOT production data.
 */
export const MOCK_SIMULATION_PROFILES: Record<MockAccountKey, UserProfile> = {
  komting_active: {
    id: "sim_user_komting_01",
    email: "komting.aktif@simulasi.local",
    full_name: "Simulasi Komting Aktif",
    role: "KOMTING",
    account_status: "ACTIVE",
    created_at: "2026-11-20T08:00:00Z",
    komting_assignment: {
      id: "sim_assign_01",
      user_id: "sim_user_komting_01",
      class_name: "IF-01",
      status: "ACTIVE",
      started_at: "2026-11-20T09:00:00Z",
      ended_at: null,
    },
  },
  komting_pending: {
    id: "sim_user_komting_02",
    email: "calon.komting@simulasi.local",
    full_name: "Simulasi Calon Komting",
    role: "KOMTING",
    account_status: "PENDING_VERIFICATION",
    created_at: "2026-11-26T07:00:00Z",
    komting_assignment: null,
  },
  komting_inactive: {
    id: "sim_user_komting_03",
    email: "komting.nonaktif@simulasi.local",
    full_name: "Simulasi Mantan Komting",
    role: "KOMTING",
    account_status: "INACTIVE",
    created_at: "2026-10-01T08:00:00Z",
    komting_assignment: {
      id: "sim_assign_00",
      user_id: "sim_user_komting_03",
      class_name: "IF-02",
      status: "INACTIVE",
      started_at: "2026-10-01T08:00:00Z",
      ended_at: "2026-11-15T10:00:00Z",
    },
  },
  staff: {
    id: "sim_user_staff_01",
    email: "staff@simulasi.local",
    full_name: "Simulasi Petugas Operasional",
    role: "STAFF",
    account_status: "ACTIVE",
    created_at: "2026-11-01T08:00:00Z",
    komting_assignment: null,
  },
  admin: {
    id: "sim_user_admin_01",
    email: "admin@simulasi.local",
    full_name: "Simulasi Administrator",
    role: "ADMIN",
    account_status: "ACTIVE",
    created_at: "2026-11-01T08:00:00Z",
    komting_assignment: null,
  },
};

export const MOCK_EMAIL_TO_ACCOUNT: Record<string, MockAccountKey> = {
  "komting.aktif@simulasi.local": "komting_active",
  "calon.komting@simulasi.local": "komting_pending",
  "komting.nonaktif@simulasi.local": "komting_inactive",
  "staff@simulasi.local": "staff",
  "admin@simulasi.local": "admin",
};

export const MOCK_SIMULATION_PROJECTORS: Projector[] = [
  {
    id: "sim_prj_01",
    asset_code: "SIM-PRJ-001",
    name: "Epson EB-X500 (Simulasi)",
    brand: "Epson",
    model: "EB-X500",
    physical_status: "AVAILABLE",
    is_active: true,
  },
  {
    id: "sim_prj_02",
    asset_code: "SIM-PRJ-002",
    name: "BenQ MS560 (Simulasi)",
    brand: "BenQ",
    model: "MS560",
    physical_status: "BORROWED",
    is_active: true,
  },
  {
    id: "sim_prj_03",
    asset_code: "SIM-PRJ-003",
    name: "Epson EB-E01 (Simulasi)",
    brand: "Epson",
    model: "EB-E01",
    physical_status: "MAINTENANCE",
    is_active: true,
  },
  {
    id: "sim_prj_04",
    asset_code: "SIM-PRJ-004",
    name: "ViewSonic PA503S (Simulasi)",
    brand: "ViewSonic",
    model: "PA503S",
    physical_status: "AVAILABLE",
    is_active: true,
  },
  {
    id: "sim_prj_05",
    asset_code: "SIM-PRJ-005",
    name: "InFocus IN112x (Simulasi)",
    brand: "InFocus",
    model: "IN112x",
    physical_status: "INACTIVE",
    is_active: false,
  },
];

export const MOCK_SIMULATION_APPLICATIONS: Record<string, KomtingApplication> = {
  sim_user_komting_01: {
    application_id: "sim_app_01",
    full_name: "Simulasi Komting Aktif",
    email: "komting.aktif@simulasi.local",
    student_id: "SIM-2024001",
    class_name: "IF-01",
    application_type: "NEW",
    status: "APPROVED",
    submitted_at: "2026-11-20T08:15:00Z",
    admin_note: "Data simulasi terverifikasi.",
    rejection_reason: null,
  },
  sim_user_komting_02: {
    application_id: "sim_app_02",
    full_name: "Simulasi Calon Komting",
    email: "calon.komting@simulasi.local",
    student_id: "SIM-2024002",
    class_name: "IF-01",
    application_type: "REPLACEMENT",
    status: "PENDING_REPLACEMENT_NOTICE",
    submitted_at: "2026-11-26T07:05:00Z",
    admin_note: null,
    rejection_reason: null,
  },
  sim_user_komting_03: {
    application_id: "sim_app_03",
    full_name: "Simulasi Mantan Komting",
    email: "komting.nonaktif@simulasi.local",
    student_id: "SIM-2023099",
    class_name: "IF-02",
    application_type: "NEW",
    status: "REJECTED",
    submitted_at: "2026-11-18T08:00:00Z",
    admin_note: null,
    rejection_reason: "Contoh penolakan simulasi: foto kartu identitas kurang jelas.",
  },
};

export const MOCK_SIMULATION_ADMIN_PENDING_NEW: KomtingApplication = {
  application_id: "sim_app_04",
  full_name: "Simulasi Pendaftar Komting Baru",
  email: "pendaftar.baru@simulasi.local",
  student_id: "SIM-2024004",
  class_name: "IF-04",
  application_type: "NEW",
  status: "PENDING_VERIFICATION",
  submitted_at: "2026-11-26T08:30:00Z",
  admin_note: null,
  rejection_reason: null,
};

export const MOCK_SIMULATION_BOOKINGS: Booking[] = [
  {
    id: "sim_booking_pickup_01",
    booking_code: "SIM-BKG-20261126-002",
    komting_id: "sim_user_komting_01",
    projector_id: "sim_prj_01",
    booking_date: "2026-11-26",
    start_time: "19:30:00",
    estimated_return_at: "2026-11-26T14:00:00Z",
    status: "CONFIRMED",
    pickup_window: {
      opens_at: "2026-11-26T12:00:00Z",
      closes_at: "2026-11-26T12:45:00Z",
    },
    created_at: "2026-11-26T08:00:00Z",
  },
  {
    id: "sim_booking_return_01",
    booking_code: "SIM-BKG-20261126-900",
    komting_id: "sim_user_komting_01",
    projector_id: "sim_prj_02",
    booking_date: "2026-11-26",
    start_time: "09:00:00",
    estimated_return_at: "2026-11-26T05:00:00Z",
    status: "FULFILLED",
    pickup_window: {
      opens_at: "2026-11-26T01:30:00Z",
      closes_at: "2026-11-26T02:15:00Z",
    },
    created_at: "2026-11-25T10:00:00Z",
  },
  {
    id: "sim_booking_history_01",
    booking_code: "SIM-BKG-20261125-001",
    komting_id: "sim_user_komting_01",
    projector_id: "sim_prj_01",
    booking_date: "2026-11-25",
    start_time: "09:00:00",
    estimated_return_at: "2026-11-25T05:00:00Z",
    status: "FULFILLED",
    pickup_window: {
      opens_at: "2026-11-25T01:30:00Z",
      closes_at: "2026-11-25T02:15:00Z",
    },
    created_at: "2026-11-24T10:00:00Z",
  },
];

export const MOCK_SIMULATION_LOANS: Loan[] = [
  {
    id: "sim_loan_active_01",
    booking_id: "sim_booking_return_01",
    projector_id: "sim_prj_02",
    komting_id: "sim_user_komting_01",
    status: "ACTIVE",
    picked_up_at: "2026-11-26T02:00:00Z",
    returned_at: null,
    return_condition: null,
  },
  {
    id: "sim_loan_01",
    booking_id: "sim_booking_history_01",
    projector_id: "sim_prj_01",
    komting_id: "sim_user_komting_01",
    status: "RETURNED",
    picked_up_at: "2026-11-25T02:00:00Z",
    returned_at: "2026-11-25T04:50:00Z",
    return_condition: "NORMAL",
  },
];

export const MOCK_SIMULATION_MAINTENANCE: MaintenanceRecord[] = [
  {
    id: "sim_maint_01",
    projector_id: "sim_prj_03",
    reason: "Lampu proyektor redup dan perlu pengecekan kipas (simulasi).",
    note: "Menunggu penggantian komponen.",
    status: "IN_PROGRESS",
    started_at: "2026-11-25T09:00:00Z",
    resolution_note: null,
    completed_at: null,
  },
];

export const MOCK_SIMULATION_QR_TOKENS: Record<string, { booking_id: string }> = {
  sim_qr_pickup_ready_01: { booking_id: "sim_booking_pickup_01" },
  sim_qr_return_active_01: { booking_id: "sim_booking_return_01" },
};

export const MOCK_SIMULATION_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "sim_audit_01",
    actor_user_id: "sim_user_admin_01",
    actor_role: "ADMIN",
    action: "OPERATING_HOURS_UPDATED",
    entity_type: "OPERATING_HOURS",
    entity_id: "sim_hours_01",
    before_data: {
      day_of_week: "MONDAY",
      open_time: "07:00",
      close_time: "17:00",
      is_active: true,
    },
    after_data: {
      day_of_week: "MONDAY",
      open_time: "07:00",
      close_time: "18:00",
      is_active: true,
    },
    reason: "Penyesuaian jadwal kuliah sore semester berjalan",
    request_id: "req_sim_audit_01",
    created_at: "2026-09-21T02:15:00Z",
  },
  {
    id: "sim_audit_02",
    actor_user_id: "sim_user_staff_01",
    actor_role: "STAFF",
    action: "LOAN_RETURNED",
    entity_type: "LOAN",
    entity_id: "sim_loan_01",
    before_data: {
      status: "ACTIVE",
      returned_at: null,
      return_condition: null,
    },
    after_data: {
      status: "RETURNED",
      returned_at: "2026-09-21T01:45:00Z",
      return_condition: "GOOD",
    },
    reason: null,
    request_id: "req_sim_audit_02",
    created_at: "2026-09-21T01:45:12Z",
  },
  {
    id: "sim_audit_03",
    actor_user_id: "sim_user_admin_01",
    actor_role: "ADMIN",
    action: "KOMTING_APPLICATION_APPROVED",
    entity_type: "KOMTING_APPLICATION",
    entity_id: "sim_app_01",
    before_data: {
      status: "PENDING_REVIEW",
      verified_by_user_id: null,
    },
    after_data: {
      status: "APPROVED",
      verified_by_user_id: "sim_user_admin_01",
    },
    reason: "Bukti KRS tervalidasi sesuai kelas IK-2024-A",
    request_id: "req_sim_audit_03",
    created_at: "2026-09-20T10:30:00Z",
  },
  {
    id: "sim_audit_04",
    actor_user_id: "sim_user_admin_01",
    actor_role: "ADMIN",
    action: "PROJECTOR_STATUS_CHANGED",
    entity_type: "PROJECTOR",
    entity_id: "sim_proj_03",
    before_data: {
      status: "AVAILABLE",
      code: "PRJ-03",
    },
    after_data: {
      status: "MAINTENANCE",
      code: "PRJ-03",
    },
    reason: "Lampu redup dan perlu pengecekan teknisi",
    request_id: "req_sim_audit_04",
    created_at: "2026-09-19T08:05:00Z",
  },
  {
    id: "sim_audit_05",
    actor_user_id: "sim_user_komting_01",
    actor_role: "KOMTING",
    action: "BOOKING_CREATED",
    entity_type: "BOOKING",
    entity_id: "sim_booking_pickup_01",
    before_data: null,
    after_data: {
      status: "APPROVED",
      projector_id: "sim_proj_01",
      room: "R-201",
    },
    reason: "Perkuliahan Metode Numerik",
    request_id: "req_sim_audit_05",
    created_at: "2026-09-18T06:20:00Z",
  },
];

export function createMockKomtingDashboard(profile: UserProfile): KomtingDashboardSummary {
  return {
    active_assignment: profile.komting_assignment ?? null,
    active_booking: null,
    active_loan: null,
    recent_bookings: [],
    relevant_projectors: MOCK_SIMULATION_PROJECTORS.slice(0, 3),
    reminders:
      profile.account_status !== "ACTIVE"
        ? [
            {
              id: "sim_rem_status",
              level: "warning",
              message:
                "Akun atau penugasan komting Anda belum aktif. Fitur booking tidak tersedia sampai status aktif.",
            },
          ]
        : [
            {
              id: "sim_rem_fe1",
              level: "info",
              message:
                "Mode simulasi FE-1: belum ada booking atau peminjaman aktif pada akun simulasi ini.",
            },
          ],
  };
}

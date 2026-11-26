import { ApiClientError } from "@/lib/api/errors";
import type { ServiceRegistry } from "@/services/contracts";
import {
  createMockRequestId,
  simulateMockRequest,
  wrapMockList,
  wrapMockSingle,
} from "@/services/mock/mock-adapter";

/**
 * Development-only mock service registry matching API_CONTRACT_PINJAM.md envelopes.
 * Contains minimal baseline stubs (not production-like dummy data) ready for Sprint FE-1..FE-4.
 */
export const mockServices: ServiceRegistry = {
  auth: {
    async getSession() {
      await simulateMockRequest();
      return null;
    },
    async signOut() {
      await simulateMockRequest();
    },
  },

  me: {
    async getMe() {
      const scenario = await simulateMockRequest();
      if (scenario === "empty") {
        throw new ApiClientError({
          status: 401,
          code: "AUTH_REQUIRED",
          requestId: createMockRequestId(),
        });
      }
      return wrapMockSingle({
        id: "mock_user_placeholder",
        email: "placeholder@example.invalid",
        full_name: "Placeholder User (Mock)",
        role: "KOMTING",
        account_status: "ACTIVE",
        komting_assignment: null,
      });
    },
    async updateMe(payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: "mock_user_placeholder",
        email: "placeholder@example.invalid",
        full_name: payload.full_name,
        role: "KOMTING",
        account_status: "ACTIVE",
        komting_assignment: null,
      });
    },
  },

  application: {
    async submitApplication() {
      await simulateMockRequest();
      return wrapMockSingle({
        application_id: "mock_application_placeholder",
        status: "PENDING_VERIFICATION",
        submitted_at: new Date().toISOString(),
      });
    },
    async getMyApplication() {
      await simulateMockRequest();
      throw new ApiClientError({
        status: 404,
        code: "PROJECTOR_NOT_FOUND",
        message: "Mock placeholder: belum ada pengajuan terdaftar.",
        requestId: createMockRequestId(),
      });
    },
    async listAdminApplications(params) {
      await simulateMockRequest();
      return wrapMockList([], params?.page, params?.page_size);
    },
    async getAdminApplication(applicationId) {
      await simulateMockRequest();
      return wrapMockSingle({
        application_id: applicationId,
        status: "PENDING_VERIFICATION",
        submitted_at: new Date().toISOString(),
      });
    },
    async approveApplication(applicationId) {
      await simulateMockRequest();
      return wrapMockSingle({
        application_id: applicationId,
        status: "APPROVED",
        assignment: {
          id: "mock_assignment_placeholder",
          status: "ACTIVE",
          class_name: "UNASSIGNED",
        },
      });
    },
    async rejectApplication(applicationId, payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        application_id: applicationId,
        status: "REJECTED",
        submitted_at: new Date().toISOString(),
        rejection_reason: payload.reason,
      });
    },
    async approveReplacement(applicationId) {
      await simulateMockRequest();
      return wrapMockSingle({
        application_id: applicationId,
        status: "APPROVED",
        assignment: {
          id: "mock_assignment_placeholder",
          status: "ACTIVE",
          class_name: "UNASSIGNED",
        },
      });
    },
    async deactivateAssignment() {
      await simulateMockRequest();
      return wrapMockSingle({ success: true });
    },
  },

  projector: {
    async listProjectors(params) {
      await simulateMockRequest();
      return wrapMockList([], params?.page, params?.page_size);
    },
    async getProjector(projectorId) {
      await simulateMockRequest();
      throw new ApiClientError({
        status: 404,
        code: "PROJECTOR_NOT_FOUND",
        message: `Mock placeholder: unit ${projectorId} belum tersedia di fixture FE-0.`,
        requestId: createMockRequestId(),
      });
    },
    async createProjector(payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: "mock_projector_placeholder",
        asset_code: payload.asset_code,
        name: payload.name,
        brand: payload.brand ?? null,
        model: payload.model ?? null,
        physical_status: "AVAILABLE",
        is_active: true,
      });
    },
    async updateProjector(projectorId, payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: projectorId,
        asset_code: "PRJ-MOCK",
        name: payload.name ?? "Mock Projector",
        brand: payload.brand ?? null,
        model: payload.model ?? null,
        physical_status: "AVAILABLE",
        is_active: true,
      });
    },
    async deactivateProjector(projectorId) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: projectorId,
        asset_code: "PRJ-MOCK",
        name: "Mock Projector",
        brand: null,
        model: null,
        physical_status: "INACTIVE",
        is_active: false,
      });
    },
  },

  availability: {
    async checkAvailability(params) {
      await simulateMockRequest();
      return wrapMockSingle({
        projector_id: params.projector_id,
        date: params.date,
        is_bookable: false,
        physical_status: "AVAILABLE",
        operating_hours: {
          service_date: params.date,
          timezone: "Asia/Jakarta",
          opens_at: "08:00:00",
          closes_at: "17:00:00",
          early_pickup_allowed_at: "07:45:00",
        },
        message: "Mock adapter FE-0 aktif: ketersediaan final ditentukan backend.",
      });
    },
  },

  booking: {
    async createBooking(payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: "mock_booking_placeholder",
        booking_code: "BKG-MOCK-000",
        komting_id: "mock_user_placeholder",
        projector_id: payload.projector_id,
        booking_date: payload.booking_date,
        start_time: payload.start_time,
        estimated_return_at: payload.estimated_return_at,
        status: "CONFIRMED",
        pickup_window: {
          opens_at: payload.estimated_return_at,
          closes_at: payload.estimated_return_at,
        },
        created_at: new Date().toISOString(),
      });
    },
    async listKomtingBookings(params) {
      await simulateMockRequest();
      return wrapMockList([], params?.page, params?.page_size);
    },
    async getKomtingBooking(bookingId) {
      await simulateMockRequest();
      throw new ApiClientError({
        status: 404,
        code: "PROJECTOR_NOT_FOUND",
        message: `Mock placeholder: booking ${bookingId} belum tersedia di fixture FE-0.`,
        requestId: createMockRequestId(),
      });
    },
    async cancelKomtingBooking(bookingId) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: bookingId,
        booking_code: "BKG-MOCK-000",
        komting_id: "mock_user_placeholder",
        projector_id: "mock_projector_placeholder",
        booking_date: "2026-11-26",
        start_time: "09:00:00",
        estimated_return_at: new Date().toISOString(),
        status: "CANCELLED",
        pickup_window: {
          opens_at: new Date().toISOString(),
          closes_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    },
    async listStaffBookings(params) {
      await simulateMockRequest();
      return wrapMockList([], params?.page, params?.page_size);
    },
    async getStaffBooking(bookingId) {
      await simulateMockRequest();
      throw new ApiClientError({
        status: 404,
        code: "PROJECTOR_NOT_FOUND",
        message: `Mock placeholder: booking ${bookingId} belum tersedia di fixture FE-0.`,
        requestId: createMockRequestId(),
      });
    },
  },

  loan: {
    async listStaffLoans(params) {
      await simulateMockRequest();
      return wrapMockList([], params?.page, params?.page_size);
    },
    async getStaffLoan(loanId) {
      await simulateMockRequest();
      throw new ApiClientError({
        status: 404,
        code: "LOAN_NOT_ACTIVE",
        message: `Mock placeholder: loan ${loanId} belum tersedia di fixture FE-0.`,
        requestId: createMockRequestId(),
      });
    },
    async confirmReturn(loanId) {
      await simulateMockRequest();
      return wrapMockSingle({
        loan: {
          id: loanId,
          status: "RETURNED",
          returned_at: new Date().toISOString(),
        },
        inspection: {
          projector_condition: "NORMAL",
          accessories_condition: "COMPLETE",
          unit_disposition: "AVAILABLE",
        },
        projector: {
          id: "mock_projector_placeholder",
          physical_status: "AVAILABLE",
        },
      });
    },
    async listKomtingLoans(params) {
      await simulateMockRequest();
      return wrapMockList([], params?.page, params?.page_size);
    },
  },

  qr: {
    async getBookingQr() {
      await simulateMockRequest();
      return wrapMockSingle({
        qr_payload: "mock_opaque_qr_token_placeholder",
        expires_at: new Date().toISOString(),
      });
    },
    async validateQr(payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        valid: false,
        action: payload.action,
        transaction: {
          booking_id: "mock_booking_placeholder",
          booking_code: "BKG-MOCK-000",
          komting_name: "Placeholder",
          class_name: "UNASSIGNED",
          projector_name: "Mock Projector",
          status: "CONFIRMED",
        },
        requires_confirmation: true,
      });
    },
    async confirmPickup(bookingId) {
      await simulateMockRequest();
      return wrapMockSingle({
        booking: { id: bookingId, status: "FULFILLED" },
        loan: {
          id: "mock_loan_placeholder",
          status: "ACTIVE",
          picked_up_at: new Date().toISOString(),
        },
        projector: {
          id: "mock_projector_placeholder",
          physical_status: "BORROWED",
        },
      });
    },
  },

  maintenance: {
    async listMaintenance(params) {
      await simulateMockRequest();
      return wrapMockList([], params?.page, params?.page_size);
    },
    async createMaintenance(projectorId, payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: "mock_maintenance_placeholder",
        projector_id: projectorId,
        reason: payload.reason,
        note: payload.note ?? null,
        status: "IN_PROGRESS",
        started_at: new Date().toISOString(),
        resolution_note: null,
        completed_at: null,
      });
    },
    async completeMaintenance(maintenanceId, payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: maintenanceId,
        projector_id: "mock_projector_placeholder",
        reason: "Mock placeholder",
        note: null,
        status: "COMPLETED",
        started_at: new Date().toISOString(),
        resolution_note: payload.resolution_note,
        completed_at: new Date().toISOString(),
      });
    },
  },

  operatingHours: {
    async getOperatingHours(date) {
      await simulateMockRequest();
      return wrapMockSingle({
        service_date: date,
        timezone: "Asia/Jakarta",
        opens_at: "08:00:00",
        closes_at: "17:00:00",
        configured_open_at: "08:00:00",
        early_pickup_allowed_at: "07:45:00",
      });
    },
    async updateOperatingHours(date, payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        service_date: date,
        timezone: "Asia/Jakarta",
        opens_at: payload.opens_at,
        closes_at: payload.closes_at,
        configured_open_at: payload.opens_at,
        early_pickup_allowed_at: payload.admin_early_open_at ?? "07:45:00",
      });
    },
  },

  admin: {
    async getKomtingDashboard() {
      await simulateMockRequest();
      return wrapMockSingle({});
    },
    async getStaffDashboard() {
      await simulateMockRequest();
      return wrapMockSingle({});
    },
    async correctTransaction() {
      await simulateMockRequest();
      return wrapMockSingle({ success: true });
    },
  },

  auditLog: {
    async listAuditLogs(params) {
      await simulateMockRequest();
      return wrapMockList([], params?.page, params?.page_size);
    },
    async getAuditLog(auditLogId) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: auditLogId,
        actor_user_id: "mock_admin_placeholder",
        actor_role: "ADMIN",
        action: "PLACEHOLDER",
        entity_type: "BOOKING",
        entity_id: "mock_entity_placeholder",
        before_data: null,
        after_data: null,
        reason: null,
        request_id: createMockRequestId(),
        created_at: new Date().toISOString(),
      });
    },
  },
};

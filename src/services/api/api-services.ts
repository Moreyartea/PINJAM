import { apiRequest } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";
import { getAuthProviderAdapter } from "@/lib/auth/provider-adapter";
import type { ServiceRegistry } from "@/services/contracts";

function requireAuthAdapter() {
  const adapter = getAuthProviderAdapter();
  if (!adapter) {
    throw new ApiClientError({
      status: 500,
      code: "AUTH_PROVIDER_NOT_CONFIGURED",
      message:
        "Provider autentikasi belum dikonfigurasi (Open Decision). Aktifkan mode mock untuk pengembangan lokal.",
    });
  }
  return adapter;
}

/**
 * Real HTTP API service implementations strictly following API_CONTRACT_PINJAM.md.
 */
export const apiServices: ServiceRegistry = {
  auth: {
    async getSession() {
      const adapter = getAuthProviderAdapter();
      return adapter ? adapter.getSession() : null;
    },
    async signInWithPassword(credentials) {
      return requireAuthAdapter().signInWithPassword(credentials);
    },
    async verifyEmail(params) {
      return requireAuthAdapter().verifyEmail(params);
    },
    async signOut() {
      const adapter = getAuthProviderAdapter();
      if (adapter) {
        await adapter.signOut();
      }
    },
  },

  me: {
    getMe: () => apiRequest("/me"),
    updateMe: (payload) =>
      apiRequest("/me", {
        method: "PATCH",
        body: payload,
      }),
  },

  application: {
    submitApplication: (formData) =>
      apiRequest("/komting/applications", {
        method: "POST",
        formData,
      }),
    getMyApplication: () => apiRequest("/komting/applications/me"),
    listAdminApplications: (params) =>
      apiRequest("/admin/komting/applications", {
        query: params,
      }),
    getAdminApplication: (applicationId) =>
      apiRequest(`/admin/komting/applications/${encodeURIComponent(applicationId)}`),
    approveApplication: (applicationId, payload) =>
      apiRequest(`/admin/komting/applications/${encodeURIComponent(applicationId)}/approve`, {
        method: "POST",
        body: payload,
      }),
    rejectApplication: (applicationId, payload) =>
      apiRequest(`/admin/komting/applications/${encodeURIComponent(applicationId)}/reject`, {
        method: "POST",
        body: payload,
      }),
    approveReplacement: (applicationId, payload) =>
      apiRequest(
        `/admin/komting/applications/${encodeURIComponent(applicationId)}/approve-replacement`,
        {
          method: "POST",
          body: payload,
        }
      ),
    deactivateAssignment: (assignmentId, payload) =>
      apiRequest(`/admin/komting/assignments/${encodeURIComponent(assignmentId)}/deactivate`, {
        method: "POST",
        body: payload,
      }),
  },

  projector: {
    listProjectors: (params) =>
      apiRequest("/projectors", {
        query: params,
      }),
    getProjector: (projectorId) => apiRequest(`/projectors/${encodeURIComponent(projectorId)}`),
    createProjector: (payload) =>
      apiRequest("/admin/projectors", {
        method: "POST",
        body: payload,
      }),
    updateProjector: (projectorId, payload) =>
      apiRequest(`/admin/projectors/${encodeURIComponent(projectorId)}`, {
        method: "PATCH",
        body: payload,
      }),
    deactivateProjector: (projectorId) =>
      apiRequest(`/admin/projectors/${encodeURIComponent(projectorId)}/deactivate`, {
        method: "POST",
      }),
  },

  availability: {
    checkAvailability: (params) =>
      apiRequest("/availability", {
        query: params,
      }),
  },

  booking: {
    createBooking: (payload, idempotencyKey) =>
      apiRequest("/bookings", {
        method: "POST",
        body: payload,
        idempotencyKey,
      }),
    listKomtingBookings: (params) =>
      apiRequest("/komting/bookings", {
        query: params,
      }),
    getKomtingBooking: (bookingId) =>
      apiRequest(`/komting/bookings/${encodeURIComponent(bookingId)}`),
    cancelKomtingBooking: (bookingId, payload) =>
      apiRequest(`/komting/bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: "POST",
        body: payload,
      }),
    listStaffBookings: (params) =>
      apiRequest("/staff/bookings", {
        query: params,
      }),
    getStaffBooking: (bookingId) => apiRequest(`/staff/bookings/${encodeURIComponent(bookingId)}`),
  },

  loan: {
    listStaffLoans: (params) =>
      apiRequest("/staff/loans", {
        query: params,
      }),
    getStaffLoan: (loanId) => apiRequest(`/staff/loans/${encodeURIComponent(loanId)}`),
    confirmReturn: (loanId, formData, idempotencyKey) =>
      apiRequest(`/staff/loans/${encodeURIComponent(loanId)}/return`, {
        method: "POST",
        formData,
        idempotencyKey,
      }),
    listKomtingLoans: (params) =>
      apiRequest("/komting/loans", {
        query: params,
      }),
  },

  qr: {
    getBookingQr: (bookingId) =>
      apiRequest(`/komting/bookings/${encodeURIComponent(bookingId)}/qr`),
    validateQr: (payload) =>
      apiRequest("/staff/qr/validate", {
        method: "POST",
        body: payload,
      }),
    confirmPickup: (bookingId, payload, idempotencyKey) =>
      apiRequest(`/staff/bookings/${encodeURIComponent(bookingId)}/pickup`, {
        method: "POST",
        body: payload,
        idempotencyKey,
      }),
  },

  maintenance: {
    listMaintenance: (params) =>
      apiRequest("/staff/maintenance", {
        query: params,
      }),
    createMaintenance: (projectorId, payload) =>
      apiRequest(`/staff/projectors/${encodeURIComponent(projectorId)}/maintenance`, {
        method: "POST",
        body: payload,
      }),
    completeMaintenance: (maintenanceId, payload) =>
      apiRequest(`/staff/maintenance/${encodeURIComponent(maintenanceId)}/complete`, {
        method: "POST",
        body: payload,
      }),
  },

  operatingHours: {
    getOperatingHours: (date) =>
      apiRequest("/operating-hours", {
        query: { date },
      }),
    updateOperatingHours: (date, payload) =>
      apiRequest(`/admin/operating-hours/${encodeURIComponent(date)}`, {
        method: "PUT",
        body: payload,
      }),
  },

  admin: {
    getKomtingDashboard: () => apiRequest("/komting/dashboard"),
    getStaffDashboard: () => apiRequest("/staff/dashboard"),
    correctTransaction: (transactionId, payload) =>
      apiRequest(`/admin/transactions/${encodeURIComponent(transactionId)}/corrections`, {
        method: "POST",
        body: payload,
      }),
  },

  auditLog: {
    listAuditLogs: (params) =>
      apiRequest("/admin/audit-logs", {
        query: params,
      }),
    getAuditLog: (auditLogId) => apiRequest(`/admin/audit-logs/${encodeURIComponent(auditLogId)}`),
  },
};

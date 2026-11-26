import { ApiClientError } from "@/lib/api/errors";
import { getActiveAccessToken } from "@/lib/auth/provider-adapter";
import {
  getJakartaDateString,
  getJakartaTomorrowDateString,
  jakartaDateTimeToUtcIso,
} from "@/lib/utils/date";
import type { ServiceRegistry } from "@/services/contracts";
import {
  createMockRequestId,
  simulateMockRequest,
  wrapMockList,
  wrapMockSingle,
} from "@/services/mock/mock-adapter";
import {
  createMockKomtingDashboard,
  MOCK_EMAIL_TO_ACCOUNT,
  MOCK_SIMULATION_APPLICATIONS,
  MOCK_SIMULATION_BOOKINGS,
  MOCK_SIMULATION_LOANS,
  MOCK_SIMULATION_PROFILES,
  MOCK_SIMULATION_PROJECTORS,
  type MockAccountKey,
} from "@/services/mock/mock-fixtures";
import type {
  Booking,
  KomtingApplication,
  OperatingHoursSnapshot,
  UserProfile,
} from "@/types/domain";

const MOCK_SESSION_STORAGE_KEY = "pinjam_dev_mock_session";

interface StoredMockSession {
  access_token: string;
  account_key: MockAccountKey;
}

let memoryMockSession: StoredMockSession | null = null;
let latestSubmittedMockApplication: KomtingApplication | null = null;
const mockBookingsStore: Booking[] = [...MOCK_SIMULATION_BOOKINGS];
const mockIdempotencyStore = new Map<string, { payloadHash: string; booking: Booking }>();

function getMockOperatingHoursForDate(date: string): OperatingHoursSnapshot {
  const tomorrow = getJakartaTomorrowDateString();
  return {
    service_date: date,
    timezone: "Asia/Jakarta",
    opens_at: "08:00:00",
    closes_at: date === tomorrow ? "16:30:00" : "17:00:00",
    configured_open_at: "08:00:00",
    early_pickup_allowed_at: "07:45:00",
  };
}

function buildMockPickupWindow(date: string, startTime: string, earlyAllowed: string) {
  const startUtc = new Date(`${date}T${startTime}+07:00`);
  const earlyUtc = new Date(`${date}T${earlyAllowed}+07:00`);
  const thirtyMinBefore = new Date(startUtc.getTime() - 30 * 60 * 1000);
  const opensAt = thirtyMinBefore > earlyUtc ? thirtyMinBefore : earlyUtc;
  const closesAt = new Date(startUtc.getTime() + 15 * 60 * 1000);
  return {
    opens_at: opensAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    closes_at: closesAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

function readMockSession(): StoredMockSession | null {
  if (memoryMockSession) return memoryMockSession;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(MOCK_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredMockSession>;
    if (
      typeof parsed.access_token === "string" &&
      typeof parsed.account_key === "string" &&
      parsed.account_key in MOCK_SIMULATION_PROFILES
    ) {
      memoryMockSession = {
        access_token: parsed.access_token,
        account_key: parsed.account_key as MockAccountKey,
      };
      return memoryMockSession;
    }
    return null;
  } catch {
    return null;
  }
}

function writeMockSession(session: StoredMockSession | null): void {
  memoryMockSession = session;
  if (typeof window === "undefined") return;

  try {
    if (session) {
      window.sessionStorage.setItem(MOCK_SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(MOCK_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures in restricted contexts
  }
}

function resolveCurrentMockProfile(): UserProfile {
  const token = getActiveAccessToken();
  const stored = readMockSession();
  const effectiveToken = token ?? stored?.access_token;

  if (!effectiveToken || effectiveToken === "expired") {
    throw new ApiClientError({
      status: 401,
      code: "AUTH_REQUIRED",
      requestId: createMockRequestId(),
    });
  }

  const keyFromToken = effectiveToken.replace("mock_token_", "") as MockAccountKey;
  const accountKey =
    keyFromToken in MOCK_SIMULATION_PROFILES
      ? keyFromToken
      : (stored?.account_key ?? "komting_active");

  return MOCK_SIMULATION_PROFILES[accountKey];
}

/**
 * Development-only mock service registry matching API_CONTRACT_PINJAM.md.
 * Contains clearly labeled simulation data, never production data.
 */
export const mockServices: ServiceRegistry = {
  auth: {
    async getSession() {
      const stored = readMockSession();
      if (!stored) return null;
      return {
        access_token: stored.access_token,
      };
    },

    async signInWithPassword(credentials) {
      await simulateMockRequest();
      const email = credentials.email.trim().toLowerCase();

      if (credentials.password === "invalid") {
        throw new ApiClientError({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "Email atau password tidak valid.",
          requestId: createMockRequestId(),
        });
      }

      const accountKey = MOCK_EMAIL_TO_ACCOUNT[email];
      if (!accountKey) {
        throw new ApiClientError({
          status: 401,
          code: "AUTH_REQUIRED",
          message:
            "Akun simulasi tidak ditemukan. Gunakan salah satu email simulasi pada panel dev.",
          requestId: createMockRequestId(),
        });
      }

      const session: StoredMockSession = {
        access_token: `mock_token_${accountKey}`,
        account_key: accountKey,
      };
      writeMockSession(session);
      return { access_token: session.access_token };
    },

    async verifyEmail(params) {
      await simulateMockRequest();
      if (params.token === "expired" || params.token_hash === "expired") {
        throw new ApiClientError({
          status: 422,
          code: "QR_EXPIRED",
          message: "Tautan verifikasi email sudah kedaluwarsa atau tidak valid.",
          requestId: createMockRequestId(),
        });
      }

      if (!params.token && !params.token_hash) {
        return {
          verified: false,
          message: "Menunggu konfirmasi tautan verifikasi email.",
        };
      }

      return {
        verified: true,
        message: "Email berhasil diverifikasi pada mode simulasi.",
      };
    },

    async signOut() {
      await simulateMockRequest("success");
      writeMockSession(null);
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
      const profile = resolveCurrentMockProfile();
      return wrapMockSingle(profile);
    },

    async updateMe(payload) {
      await simulateMockRequest();
      const profile = resolveCurrentMockProfile();
      return wrapMockSingle({
        ...profile,
        full_name: payload.full_name,
      });
    },
  },

  application: {
    async submitApplication(formData) {
      await simulateMockRequest();
      const fullName = String(formData.get("full_name") ?? "");
      const email = String(formData.get("email") ?? "");
      const studentId = String(formData.get("student_id") ?? "");
      const className = String(formData.get("class_name") ?? "");
      const submittedAt = new Date().toISOString();
      const applicationId = `sim_app_${Date.now().toString(36)}`;
      const isReplacementClass = className.trim().toUpperCase() === "IF-01";

      latestSubmittedMockApplication = {
        application_id: applicationId,
        full_name: fullName,
        email,
        student_id: studentId,
        class_name: className,
        application_type: isReplacementClass ? "REPLACEMENT" : "NEW",
        status: isReplacementClass ? "PENDING_REPLACEMENT_NOTICE" : "PENDING_VERIFICATION",
        submitted_at: submittedAt,
        admin_note: isReplacementClass
          ? "Kelas sudah memiliki komting aktif; diproses sebagai pengajuan pergantian (simulasi)."
          : null,
        rejection_reason: null,
      };

      return wrapMockSingle({
        application_id: applicationId,
        status: latestSubmittedMockApplication.status,
        submitted_at: submittedAt,
      });
    },

    async getMyApplication() {
      const scenario = await simulateMockRequest();
      if (scenario === "empty") {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: "Belum ada pengajuan komting terdaftar untuk akun ini.",
          requestId: createMockRequestId(),
        });
      }

      if (latestSubmittedMockApplication) {
        return wrapMockSingle(latestSubmittedMockApplication);
      }

      const profile = resolveCurrentMockProfile();
      const existing = MOCK_SIMULATION_APPLICATIONS[profile.id];
      if (!existing) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: "Belum ada pengajuan komting untuk akun ini.",
          requestId: createMockRequestId(),
        });
      }

      return wrapMockSingle(existing);
    },

    async listAdminApplications(params) {
      await simulateMockRequest();
      return wrapMockList(
        Object.values(MOCK_SIMULATION_APPLICATIONS),
        params?.page,
        params?.page_size
      );
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
          id: "sim_assignment_approved",
          status: "ACTIVE",
          class_name: "IF-01",
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
          id: "sim_assignment_replaced",
          status: "ACTIVE",
          class_name: "IF-01",
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
      const scenario = await simulateMockRequest();
      if (scenario === "empty") {
        return wrapMockList([], params?.page ?? 1, params?.page_size ?? 20);
      }

      const filtered = params?.physical_status
        ? MOCK_SIMULATION_PROJECTORS.filter(
            (item) => item.physical_status === params.physical_status
          )
        : MOCK_SIMULATION_PROJECTORS;

      const page = params?.page ?? 1;
      const pageSize = params?.page_size ?? 20;
      const start = (page - 1) * pageSize;
      const paged = filtered.slice(start, start + pageSize);

      return {
        data: paged,
        meta: {
          request_id: createMockRequestId(),
          pagination: {
            page,
            page_size: pageSize,
            total_items: filtered.length,
            total_pages: filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize),
          },
        },
      };
    },

    async getProjector(projectorId) {
      await simulateMockRequest();
      const found = MOCK_SIMULATION_PROJECTORS.find((p) => p.id === projectorId);
      if (!found) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          requestId: createMockRequestId(),
        });
      }
      return wrapMockSingle(found);
    },

    async createProjector(payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        id: "sim_prj_new",
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
        asset_code: "SIM-PRJ-UPD",
        name: payload.name ?? "Updated Simulator Projector",
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
        asset_code: "SIM-PRJ-DEC",
        name: "Deactivated Simulator Projector",
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
      const projector = MOCK_SIMULATION_PROJECTORS.find((p) => p.id === params.projector_id);
      if (!projector) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          requestId: createMockRequestId(),
        });
      }

      const today = getJakartaDateString();
      const tomorrow = getJakartaTomorrowDateString();
      const operatingHours = getMockOperatingHoursForDate(params.date);

      let isBookable = false;
      let message: string | null = null;

      if (projector.physical_status === "MAINTENANCE" || projector.physical_status === "INACTIVE") {
        isBookable = false;
        message =
          "Unit sedang dalam maintenance atau nonaktif sehingga tidak dapat dibooking (simulasi).";
      } else if (projector.physical_status === "BORROWED") {
        if (params.date === tomorrow) {
          isBookable = true;
          message =
            "Unit sedang BORROWED hari ini. Booking besok bersifat bersyarat dan akan dibatalkan pukul 00:00 WIB bila unit belum dikembalikan.";
        } else {
          isBookable = false;
          message = "Unit sedang BORROWED hari ini sehingga belum tersedia untuk booking hari ini.";
        }
      } else if (params.date !== today && params.date !== tomorrow) {
        isBookable = false;
        message = "Booking hanya tersedia untuk hari ini atau besok (Asia/Jakarta).";
      } else {
        isBookable = true;
      }

      return wrapMockSingle({
        projector_id: projector.id,
        date: params.date,
        is_bookable: isBookable,
        physical_status: projector.physical_status,
        operating_hours: operatingHours,
        message,
      });
    },
  },

  booking: {
    async createBooking(payload, idempotencyKey) {
      await simulateMockRequest();
      const profile = resolveCurrentMockProfile();

      if (profile.account_status !== "ACTIVE") {
        throw new ApiClientError({
          status: 403,
          code: "ACCOUNT_NOT_ACTIVE",
          requestId: createMockRequestId(),
        });
      }
      if (profile.komting_assignment?.status !== "ACTIVE") {
        throw new ApiClientError({
          status: 403,
          code: "KOMTING_ASSIGNMENT_REQUIRED",
          requestId: createMockRequestId(),
        });
      }

      const payloadHash = JSON.stringify(payload);
      const existingIdemp = mockIdempotencyStore.get(idempotencyKey);
      if (existingIdemp) {
        if (existingIdemp.payloadHash !== payloadHash) {
          throw new ApiClientError({
            status: 409,
            code: "IDEMPOTENCY_KEY_REUSED",
            requestId: createMockRequestId(),
          });
        }
        return wrapMockSingle(existingIdemp.booking);
      }

      const hasActiveBooking = mockBookingsStore.some(
        (b) => b.komting_id === profile.id && b.status === "CONFIRMED"
      );
      if (hasActiveBooking) {
        throw new ApiClientError({
          status: 409,
          code: "ACTIVE_BOOKING_EXISTS",
          requestId: createMockRequestId(),
        });
      }

      const projector = MOCK_SIMULATION_PROJECTORS.find((p) => p.id === payload.projector_id);
      if (!projector) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          requestId: createMockRequestId(),
        });
      }
      if (projector.physical_status === "MAINTENANCE" || projector.physical_status === "INACTIVE") {
        throw new ApiClientError({
          status: 409,
          code: "PROJECTOR_NOT_BOOKABLE",
          requestId: createMockRequestId(),
        });
      }

      const hours = getMockOperatingHoursForDate(payload.booking_date);
      const id = `sim_booking_${Date.now().toString(36)}`;
      const created: Booking = {
        id,
        booking_code: `SIM-BKG-${payload.booking_date.replace(/-/g, "")}-${String(
          mockBookingsStore.length + 1
        ).padStart(3, "0")}`,
        komting_id: profile.id,
        projector_id: payload.projector_id,
        booking_date: payload.booking_date,
        start_time: payload.start_time,
        estimated_return_at: payload.estimated_return_at,
        status: "CONFIRMED",
        pickup_window: buildMockPickupWindow(
          payload.booking_date,
          payload.start_time,
          hours.early_pickup_allowed_at
        ),
        created_at: jakartaDateTimeToUtcIso(getJakartaDateString(), "08:00:00"),
      };

      mockBookingsStore.unshift(created);
      mockIdempotencyStore.set(idempotencyKey, { payloadHash, booking: created });

      return wrapMockSingle(created);
    },

    async listKomtingBookings(params) {
      const scenario = await simulateMockRequest();
      if (scenario === "empty") {
        return wrapMockList([], params?.page ?? 1, params?.page_size ?? 20);
      }

      const profile = resolveCurrentMockProfile();
      const filtered = mockBookingsStore.filter((item) => {
        if (item.komting_id !== profile.id) return false;
        if (params?.status && item.status !== params.status) return false;
        return true;
      });

      const page = params?.page ?? 1;
      const pageSize = params?.page_size ?? 20;
      const start = (page - 1) * pageSize;
      const paged = filtered.slice(start, start + pageSize);

      return {
        data: paged,
        meta: {
          request_id: createMockRequestId(),
          pagination: {
            page,
            page_size: pageSize,
            total_items: filtered.length,
            total_pages: filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize),
          },
        },
      };
    },

    async getKomtingBooking(bookingId) {
      await simulateMockRequest();
      const found = mockBookingsStore.find((b) => b.id === bookingId);
      if (!found) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: `Simulasi: booking ${bookingId} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }
      return wrapMockSingle(found);
    },

    async cancelKomtingBooking(bookingId) {
      await simulateMockRequest();
      const index = mockBookingsStore.findIndex((b) => b.id === bookingId);
      if (index === -1) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: `Simulasi: booking ${bookingId} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }

      const target = mockBookingsStore[index];
      if (!target || target.status !== "CONFIRMED") {
        throw new ApiClientError({
          status: 409,
          code: "BOOKING_CONFLICT",
          message: "Hanya booking berstatus CONFIRMED yang dapat dibatalkan.",
          requestId: createMockRequestId(),
        });
      }

      const updated: Booking = {
        ...target,
        status: "CANCELLED",
      };
      mockBookingsStore[index] = updated;
      return wrapMockSingle(updated);
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
        message: `Simulasi: booking ${bookingId} belum tersedia.`,
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
        message: `Simulasi: loan ${loanId} belum tersedia.`,
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
          id: "sim_prj_01",
          physical_status: "AVAILABLE",
        },
      });
    },
    async listKomtingLoans(params) {
      const scenario = await simulateMockRequest();
      if (scenario === "empty") {
        return wrapMockList([], params?.page ?? 1, params?.page_size ?? 20);
      }

      const profile = resolveCurrentMockProfile();
      const filtered = MOCK_SIMULATION_LOANS.filter((item) => {
        if (item.komting_id !== profile.id) return false;
        if (params?.status && item.status !== params.status) return false;
        return true;
      });

      const page = params?.page ?? 1;
      const pageSize = params?.page_size ?? 20;
      const start = (page - 1) * pageSize;
      const paged = filtered.slice(start, start + pageSize);

      return {
        data: paged,
        meta: {
          request_id: createMockRequestId(),
          pagination: {
            page,
            page_size: pageSize,
            total_items: filtered.length,
            total_pages: filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize),
          },
        },
      };
    },
  },

  qr: {
    async getBookingQr(bookingId) {
      await simulateMockRequest();
      const booking = mockBookingsStore.find((b) => b.id === bookingId);
      if (!booking) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          requestId: createMockRequestId(),
        });
      }
      if (booking.status !== "CONFIRMED" && booking.status !== "FULFILLED") {
        throw new ApiClientError({
          status: 409,
          code: "BOOKING_NOT_PICKUP_ELIGIBLE",
          message: "QR tidak tersedia untuk booking yang sudah dibatalkan atau kedaluwarsa.",
          requestId: createMockRequestId(),
        });
      }
      return wrapMockSingle({
        qr_payload: `sim_opaque_token_${booking.booking_code.slice(-3)}_${Math.random()
          .toString(36)
          .slice(2, 10)}`,
        expires_at: booking.pickup_window.closes_at,
      });
    },
    async validateQr(payload) {
      await simulateMockRequest();
      return wrapMockSingle({
        valid: false,
        action: payload.action,
        transaction: {
          booking_id: "sim_booking_01",
          booking_code: "BKG-SIM-001",
          komting_name: "Simulasi Komting",
          class_name: "IF-01",
          projector_name: "Epson EB-X500 (Simulasi)",
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
          id: "sim_loan_01",
          status: "ACTIVE",
          picked_up_at: new Date().toISOString(),
        },
        projector: {
          id: "sim_prj_01",
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
        id: "sim_maint_01",
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
        projector_id: "sim_prj_01",
        reason: "Simulasi",
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
      return wrapMockSingle(getMockOperatingHoursForDate(date));
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
      const scenario = await simulateMockRequest();
      const profile = resolveCurrentMockProfile();
      if (scenario === "empty") {
        return wrapMockSingle({
          active_assignment: profile.komting_assignment ?? null,
          active_booking: null,
          active_loan: null,
          recent_bookings: [],
          relevant_projectors: [],
          reminders: [],
        });
      }
      const baseDashboard = createMockKomtingDashboard(profile);
      const activeBooking =
        mockBookingsStore.find((b) => b.komting_id === profile.id && b.status === "CONFIRMED") ??
        null;
      return wrapMockSingle({
        ...baseDashboard,
        active_booking: activeBooking,
      });
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
        actor_user_id: "sim_user_admin_01",
        actor_role: "ADMIN",
        action: "SIMULATION",
        entity_type: "BOOKING",
        entity_id: "sim_entity_01",
        before_data: null,
        after_data: null,
        reason: null,
        request_id: createMockRequestId(),
        created_at: new Date().toISOString(),
      });
    },
  },
};

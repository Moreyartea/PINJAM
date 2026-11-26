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
  MOCK_SIMULATION_ADMIN_PENDING_NEW,
  MOCK_SIMULATION_APPLICATIONS,
  MOCK_SIMULATION_BOOKINGS,
  MOCK_SIMULATION_LOANS,
  MOCK_SIMULATION_MAINTENANCE,
  MOCK_SIMULATION_PROFILES,
  MOCK_SIMULATION_PROJECTORS,
  MOCK_SIMULATION_QR_TOKENS,
  type MockAccountKey,
} from "@/services/mock/mock-fixtures";
import type {
  Booking,
  KomtingApplication,
  Loan,
  MaintenanceRecord,
  OperatingHoursSnapshot,
  Projector,
  UserProfile,
} from "@/types/domain";

const MOCK_SESSION_STORAGE_KEY = "pinjam_dev_mock_session";

interface StoredMockSession {
  access_token: string;
  account_key: MockAccountKey;
}

let memoryMockSession: StoredMockSession | null = null;
let latestSubmittedMockApplication: KomtingApplication | null = null;
const mockApplicationsStore: KomtingApplication[] = [
  { ...MOCK_SIMULATION_ADMIN_PENDING_NEW },
  ...Object.values(MOCK_SIMULATION_APPLICATIONS).map((app) => ({ ...app })),
];
const mockAdminIdempotencyStore = new Map<string, { payloadHash: string; result: unknown }>();
const mockProjectorsStore: Projector[] = MOCK_SIMULATION_PROJECTORS.map((p) => ({ ...p }));
const mockBookingsStore: Booking[] = MOCK_SIMULATION_BOOKINGS.map((b) => ({
  ...b,
  pickup_window: { ...b.pickup_window },
}));
const mockLoansStore: Loan[] = MOCK_SIMULATION_LOANS.map((l) => ({ ...l }));
const mockMaintenanceStore: MaintenanceRecord[] = MOCK_SIMULATION_MAINTENANCE.map((m) => ({
  ...m,
}));
const mockQrTokenStore = new Map<string, { booking_id: string }>(
  Object.entries(MOCK_SIMULATION_QR_TOKENS)
);
const mockIdempotencyStore = new Map<string, { payloadHash: string; booking: Booking }>();
const mockStaffIdempotencyStore = new Map<string, { payloadHash: string; result: unknown }>();
const mockOperatingHoursStore = new Map<string, OperatingHoursSnapshot>();

function resolveMockQrDisplayContext(komtingId: string, projectorId: string) {
  const komtingProfile = Object.values(MOCK_SIMULATION_PROFILES).find((p) => p.id === komtingId);
  const projector = mockProjectorsStore.find((p) => p.id === projectorId);
  return {
    komting_name: komtingProfile?.full_name ?? "Simulasi Komting",
    class_name: komtingProfile?.komting_assignment?.class_name ?? "IF-01",
    projector_name: projector?.name ?? projectorId,
  };
}

function requireStaffOrAdminMock(): UserProfile {
  const profile = resolveCurrentMockProfile();
  if (profile.role !== "STAFF" && profile.role !== "ADMIN") {
    throw new ApiClientError({
      status: 403,
      code: "FORBIDDEN",
      requestId: createMockRequestId(),
    });
  }
  return profile;
}

function requireAdminMock(): UserProfile {
  const profile = resolveCurrentMockProfile();
  if (profile.role !== "ADMIN") {
    throw new ApiClientError({
      status: 403,
      code: "FORBIDDEN",
      requestId: createMockRequestId(),
    });
  }
  return profile;
}

function getMockOperatingHoursForDate(date: string): OperatingHoursSnapshot {
  const saved = mockOperatingHoursStore.get(date);
  if (saved) return saved;
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

function addMinutesToTimeString(timeStr: string, deltaMinutes: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 59, (h ?? 0) * 60 + (m ?? 0) + deltaMinutes));
  const nextH = String(Math.floor(total / 60)).padStart(2, "0");
  const nextM = String(total % 60).padStart(2, "0");
  return `${nextH}:${nextM}:00`;
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
      mockApplicationsStore.unshift({ ...latestSubmittedMockApplication });

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
      const scenario = await simulateMockRequest();
      requireAdminMock();
      if (scenario === "empty") {
        return wrapMockList([], params?.page ?? 1, params?.page_size ?? 20);
      }

      const filtered = params?.status
        ? mockApplicationsStore.filter((item) => item.status === params.status)
        : mockApplicationsStore;

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

    async getAdminApplication(applicationId) {
      await simulateMockRequest();
      requireAdminMock();
      const found = mockApplicationsStore.find((app) => app.application_id === applicationId);
      if (!found) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: `Simulasi: pengajuan ${applicationId} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }
      return wrapMockSingle(found);
    },

    async approveApplication(applicationId, payload) {
      await simulateMockRequest();
      requireAdminMock();
      const index = mockApplicationsStore.findIndex((app) => app.application_id === applicationId);
      const target = index >= 0 ? mockApplicationsStore[index] : undefined;
      if (!target) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: `Simulasi: pengajuan ${applicationId} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }
      if (
        (target.status !== "PENDING_VERIFICATION" && target.status !== "PENDING_REVIEW") ||
        target.application_type === "REPLACEMENT"
      ) {
        throw new ApiClientError({
          status: 409,
          code: "APPLICATION_ALREADY_EXISTS",
          message: "Status pengajuan saat ini tidak dapat disetujui melalui alur pengajuan baru.",
          requestId: createMockRequestId(),
        });
      }

      mockApplicationsStore[index] = {
        ...target,
        status: "APPROVED",
        admin_note: payload.admin_note ?? null,
      };
      if (latestSubmittedMockApplication?.application_id === applicationId) {
        latestSubmittedMockApplication = mockApplicationsStore[index];
      }

      return wrapMockSingle({
        application_id: applicationId,
        status: "APPROVED",
        assignment: {
          id: `sim_assignment_${Date.now().toString(36)}`,
          status: "ACTIVE",
          class_name: target.class_name ?? "IF-01",
        },
      });
    },

    async rejectApplication(applicationId, payload) {
      await simulateMockRequest();
      requireAdminMock();
      const index = mockApplicationsStore.findIndex((app) => app.application_id === applicationId);
      const target = index >= 0 ? mockApplicationsStore[index] : undefined;
      if (!target) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: `Simulasi: pengajuan ${applicationId} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }
      if (
        target.status !== "PENDING_VERIFICATION" &&
        target.status !== "PENDING_REVIEW" &&
        target.status !== "PENDING_REPLACEMENT_NOTICE"
      ) {
        throw new ApiClientError({
          status: 409,
          code: "BOOKING_CONFLICT",
          message: "Hanya pengajuan pending yang dapat ditolak.",
          requestId: createMockRequestId(),
        });
      }
      if (!payload.reason.trim()) {
        throw new ApiClientError({
          status: 422,
          code: "RETURN_INSPECTION_REQUIRED",
          message: "Alasan penolakan wajib diisi.",
          requestId: createMockRequestId(),
        });
      }

      const updated: KomtingApplication = {
        ...target,
        status: "REJECTED",
        rejection_reason: payload.reason.trim(),
      };
      mockApplicationsStore[index] = updated;
      if (latestSubmittedMockApplication?.application_id === applicationId) {
        latestSubmittedMockApplication = updated;
      }
      return wrapMockSingle(updated);
    },

    async approveReplacement(applicationId, payload, idempotencyKey) {
      await simulateMockRequest();
      requireAdminMock();

      const payloadHash = JSON.stringify({ applicationId, payload });
      const existing = mockAdminIdempotencyStore.get(`replacement:${idempotencyKey}`);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ApiClientError({
            status: 409,
            code: "IDEMPOTENCY_KEY_REUSED",
            requestId: createMockRequestId(),
          });
        }
        return wrapMockSingle(existing.result as never);
      }

      const index = mockApplicationsStore.findIndex((app) => app.application_id === applicationId);
      const target = index >= 0 ? mockApplicationsStore[index] : undefined;
      if (!target) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: `Simulasi: pengajuan ${applicationId} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }
      if (
        target.status !== "PENDING_REPLACEMENT_NOTICE" &&
        target.status !== "PENDING_VERIFICATION" &&
        target.status !== "PENDING_REVIEW"
      ) {
        throw new ApiClientError({
          status: 409,
          code: "BOOKING_CONFLICT",
          message: "Status pengajuan replacement ini sudah diproses atau tidak eligible.",
          requestId: createMockRequestId(),
        });
      }

      mockApplicationsStore[index] = {
        ...target,
        status: "APPROVED",
        admin_note: payload.admin_note ?? null,
      };
      if (latestSubmittedMockApplication?.application_id === applicationId) {
        latestSubmittedMockApplication = mockApplicationsStore[index];
      }

      const result = {
        application_id: applicationId,
        status: "APPROVED",
        assignment: {
          id: `sim_assignment_replaced_${Date.now().toString(36)}`,
          status: "ACTIVE",
          class_name: target.class_name ?? "IF-01",
        },
      };
      mockAdminIdempotencyStore.set(`replacement:${idempotencyKey}`, { payloadHash, result });
      return wrapMockSingle(result);
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
        ? mockProjectorsStore.filter((item) => item.physical_status === params.physical_status)
        : mockProjectorsStore;

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
      const found = mockProjectorsStore.find((p) => p.id === projectorId);
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
      requireAdminMock();

      const assetCode = payload.asset_code.trim();
      const name = payload.name.trim();
      if (!assetCode || !name) {
        throw new ApiClientError({
          status: 422,
          code: "RETURN_INSPECTION_REQUIRED",
          message: "Kode aset dan nama proyektor wajib diisi.",
          requestId: createMockRequestId(),
        });
      }

      const duplicate = mockProjectorsStore.some(
        (unit) => unit.asset_code.trim().toLowerCase() === assetCode.toLowerCase()
      );
      if (duplicate) {
        throw new ApiClientError({
          status: 409,
          code: "BOOKING_CONFLICT",
          message: `Kode aset ${assetCode} sudah terdaftar pada inventaris.`,
          details: [
            {
              field: "asset_code",
              reason: `Kode aset ${assetCode} sudah digunakan.`,
            },
          ],
          requestId: createMockRequestId(),
        });
      }

      const created: Projector = {
        id: `sim_prj_${Date.now().toString(36)}`,
        asset_code: assetCode,
        name,
        brand: payload.brand?.trim() || null,
        model: payload.model?.trim() || null,
        physical_status: "AVAILABLE",
        is_active: true,
      };
      mockProjectorsStore.unshift(created);
      return wrapMockSingle(created);
    },

    async updateProjector(projectorId, payload) {
      await simulateMockRequest();
      requireAdminMock();

      const index = mockProjectorsStore.findIndex((unit) => unit.id === projectorId);
      const target = index >= 0 ? mockProjectorsStore[index] : undefined;
      if (!target) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          requestId: createMockRequestId(),
        });
      }

      const nextName = payload.name !== undefined ? payload.name.trim() : target.name;
      if (!nextName) {
        throw new ApiClientError({
          status: 422,
          code: "RETURN_INSPECTION_REQUIRED",
          message: "Nama proyektor wajib diisi.",
          requestId: createMockRequestId(),
        });
      }

      const updated: Projector = {
        ...target,
        name: nextName,
        brand: payload.brand !== undefined ? payload.brand?.trim() || null : target.brand,
        model: payload.model !== undefined ? payload.model?.trim() || null : target.model,
      };
      mockProjectorsStore[index] = updated;
      return wrapMockSingle(updated);
    },

    async deactivateProjector(projectorId) {
      await simulateMockRequest();
      requireAdminMock();

      const index = mockProjectorsStore.findIndex((unit) => unit.id === projectorId);
      const target = index >= 0 ? mockProjectorsStore[index] : undefined;
      if (!target) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          requestId: createMockRequestId(),
        });
      }

      const hasActiveLoan =
        target.physical_status === "BORROWED" ||
        mockLoansStore.some(
          (loan) => loan.projector_id === projectorId && loan.status === "ACTIVE"
        );
      if (hasActiveLoan) {
        throw new ApiClientError({
          status: 409,
          code: "PROJECTOR_HAS_ACTIVE_LOAN",
          message:
            "Unit tidak dapat dinonaktifkan karena sedang dipinjam atau memiliki loan aktif.",
          requestId: createMockRequestId(),
        });
      }

      const deactivated: Projector = {
        ...target,
        physical_status: "INACTIVE",
        is_active: false,
      };
      mockProjectorsStore[index] = deactivated;
      return wrapMockSingle(deactivated);
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
      const scenario = await simulateMockRequest();
      requireStaffOrAdminMock();
      if (scenario === "empty") {
        return wrapMockList([], params?.page ?? 1, params?.page_size ?? 20);
      }

      const filtered = mockBookingsStore.filter((item) => {
        if (params?.date && item.booking_date !== params.date) return false;
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
    async getStaffBooking(bookingId) {
      await simulateMockRequest();
      requireStaffOrAdminMock();
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
  },

  loan: {
    async listStaffLoans(params) {
      const scenario = await simulateMockRequest();
      requireStaffOrAdminMock();
      if (scenario === "empty") {
        return wrapMockList([], params?.page ?? 1, params?.page_size ?? 20);
      }

      const filtered = mockLoansStore.filter((item) => {
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
    async getStaffLoan(loanId) {
      await simulateMockRequest();
      requireStaffOrAdminMock();
      const found = mockLoansStore.find((l) => l.id === loanId);
      if (!found) {
        throw new ApiClientError({
          status: 404,
          code: "LOAN_NOT_ACTIVE",
          message: `Simulasi: loan ${loanId} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }
      return wrapMockSingle(found);
    },
    async confirmReturn(loanId, formData, idempotencyKey) {
      await simulateMockRequest();
      requireStaffOrAdminMock();

      const qrPayload = String(formData.get("qr_payload") ?? "");
      const projectorCondition = String(formData.get("projector_condition") ?? "NORMAL");
      const accessoriesCondition = String(formData.get("accessories_condition") ?? "COMPLETE");
      const evidencePhoto = formData.get("evidence_photo");
      const payloadHash = JSON.stringify({
        loanId,
        qrPayload,
        projectorCondition,
        accessoriesCondition,
      });

      const existing = mockStaffIdempotencyStore.get(`return:${idempotencyKey}`);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ApiClientError({
            status: 409,
            code: "IDEMPOTENCY_KEY_REUSED",
            requestId: createMockRequestId(),
          });
        }
        return wrapMockSingle(existing.result as never);
      }

      const loanIndex = mockLoansStore.findIndex((l) => l.id === loanId);
      const loan = loanIndex >= 0 ? mockLoansStore[loanIndex] : undefined;
      if (!loan || loan.status !== "ACTIVE") {
        throw new ApiClientError({
          status: 409,
          code: "LOAN_NOT_ACTIVE",
          requestId: createMockRequestId(),
        });
      }

      if (
        (projectorCondition === "DAMAGED" || accessoriesCondition === "INCOMPLETE") &&
        !(evidencePhoto instanceof File && evidencePhoto.size > 0)
      ) {
        throw new ApiClientError({
          status: 422,
          code: "RETURN_EVIDENCE_REQUIRED",
          requestId: createMockRequestId(),
        });
      }

      const disposition =
        projectorCondition === "DAMAGED" || accessoriesCondition === "INCOMPLETE"
          ? "MAINTENANCE"
          : "AVAILABLE";
      const returnedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

      mockLoansStore[loanIndex] = {
        ...loan,
        status: "RETURNED",
        returned_at: returnedAt,
        return_condition: projectorCondition,
      };

      const projIndex = mockProjectorsStore.findIndex((p) => p.id === loan.projector_id);
      if (projIndex >= 0 && mockProjectorsStore[projIndex]) {
        mockProjectorsStore[projIndex] = {
          ...mockProjectorsStore[projIndex],
          physical_status: disposition,
        };
      }

      if (disposition === "MAINTENANCE") {
        mockMaintenanceStore.unshift({
          id: `sim_maint_${Date.now().toString(36)}`,
          projector_id: loan.projector_id,
          reason:
            projectorCondition === "DAMAGED"
              ? "Kerusakan unit saat pengembalian (simulasi)."
              : "Aksesori tidak lengkap saat pengembalian (simulasi).",
          note: String(formData.get("note") ?? "") || null,
          status: "IN_PROGRESS",
          started_at: returnedAt,
          resolution_note: null,
          completed_at: null,
        });
      }

      const result = {
        loan: {
          id: loan.id,
          status: "RETURNED",
          returned_at: returnedAt,
        },
        inspection: {
          projector_condition: projectorCondition,
          accessories_condition: accessoriesCondition,
          unit_disposition: disposition,
        },
        projector: {
          id: loan.projector_id,
          physical_status: disposition,
        },
      };
      mockStaffIdempotencyStore.set(`return:${idempotencyKey}`, { payloadHash, result });
      return wrapMockSingle(result);
    },
    async listKomtingLoans(params) {
      const scenario = await simulateMockRequest();
      if (scenario === "empty") {
        return wrapMockList([], params?.page ?? 1, params?.page_size ?? 20);
      }

      const profile = resolveCurrentMockProfile();
      const filtered = mockLoansStore.filter((item) => {
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

      for (const [token, mapped] of mockQrTokenStore.entries()) {
        if (mapped.booking_id === booking.id) {
          return wrapMockSingle({
            qr_payload: token,
            expires_at: booking.pickup_window.closes_at,
          });
        }
      }

      const generatedToken = `sim_opaque_token_${booking.booking_code.slice(-3)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      mockQrTokenStore.set(generatedToken, { booking_id: booking.id });
      return wrapMockSingle({
        qr_payload: generatedToken,
        expires_at: booking.pickup_window.closes_at,
      });
    },
    async validateQr(payload) {
      await simulateMockRequest();
      requireStaffOrAdminMock();

      const token = payload.qr_payload.trim();
      if (!token || token === "invalid") {
        throw new ApiClientError({
          status: 422,
          code: "QR_INVALID",
          requestId: createMockRequestId(),
        });
      }
      if (token === "expired") {
        throw new ApiClientError({
          status: 422,
          code: "QR_EXPIRED",
          requestId: createMockRequestId(),
        });
      }

      const entry = mockQrTokenStore.get(token);
      if (!entry) {
        throw new ApiClientError({
          status: 422,
          code: "QR_INVALID",
          requestId: createMockRequestId(),
        });
      }

      const booking = mockBookingsStore.find((b) => b.id === entry.booking_id);
      const loan = mockLoansStore.find(
        (l) => l.booking_id === entry.booking_id && l.status === "ACTIVE"
      );

      if (payload.action === "PICKUP") {
        if (!booking || booking.status !== "CONFIRMED") {
          throw new ApiClientError({
            status: 409,
            code: "QR_ACTION_MISMATCH",
            message: "Booking tidak berstatus CONFIRMED untuk pickup.",
            requestId: createMockRequestId(),
          });
        }
        const display = resolveMockQrDisplayContext(booking.komting_id, booking.projector_id);
        return wrapMockSingle({
          valid: true,
          action: "PICKUP",
          transaction: {
            booking_id: booking.id,
            booking_code: booking.booking_code,
            komting_name: display.komting_name,
            class_name: display.class_name,
            projector_name: display.projector_name,
            status: booking.status,
          },
          requires_confirmation: true,
        });
      }

      if (!loan || loan.status !== "ACTIVE") {
        throw new ApiClientError({
          status: 409,
          code: "QR_ACTION_MISMATCH",
          message: "Tidak ditemukan loan ACTIVE untuk token QR ini.",
          requestId: createMockRequestId(),
        });
      }

      const display = resolveMockQrDisplayContext(loan.komting_id, loan.projector_id);
      return wrapMockSingle({
        valid: true,
        action: "RETURN",
        transaction: {
          booking_id: loan.booking_id,
          booking_code: booking?.booking_code ?? loan.booking_id,
          komting_name: display.komting_name,
          class_name: display.class_name,
          projector_name: display.projector_name,
          status: loan.status,
        },
        requires_confirmation: true,
      });
    },
    async confirmPickup(bookingId, payload, idempotencyKey) {
      await simulateMockRequest();
      requireStaffOrAdminMock();

      const payloadHash = JSON.stringify({ bookingId, payload });
      const existing = mockStaffIdempotencyStore.get(`pickup:${idempotencyKey}`);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ApiClientError({
            status: 409,
            code: "IDEMPOTENCY_KEY_REUSED",
            requestId: createMockRequestId(),
          });
        }
        return wrapMockSingle(existing.result as never);
      }

      const bookingIndex = mockBookingsStore.findIndex((b) => b.id === bookingId);
      const booking = bookingIndex >= 0 ? mockBookingsStore[bookingIndex] : undefined;
      if (!booking) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          requestId: createMockRequestId(),
        });
      }
      if (booking.status !== "CONFIRMED") {
        throw new ApiClientError({
          status: 409,
          code: "BOOKING_NOT_PICKUP_ELIGIBLE",
          requestId: createMockRequestId(),
        });
      }

      const pickedUpAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const newLoanId = `sim_loan_${Date.now().toString(36)}`;

      mockBookingsStore[bookingIndex] = {
        ...booking,
        status: "FULFILLED",
      };

      const createdLoan: Loan = {
        id: newLoanId,
        booking_id: booking.id,
        projector_id: booking.projector_id,
        komting_id: booking.komting_id,
        status: "ACTIVE",
        picked_up_at: pickedUpAt,
        returned_at: null,
        return_condition: null,
      };
      mockLoansStore.unshift(createdLoan);
      mockQrTokenStore.set(payload.qr_payload, { booking_id: booking.id });

      const projIndex = mockProjectorsStore.findIndex((p) => p.id === booking.projector_id);
      if (projIndex >= 0 && mockProjectorsStore[projIndex]) {
        mockProjectorsStore[projIndex] = {
          ...mockProjectorsStore[projIndex],
          physical_status: "BORROWED",
        };
      }

      const result = {
        booking: { id: booking.id, status: "FULFILLED" },
        loan: {
          id: newLoanId,
          status: "ACTIVE",
          picked_up_at: pickedUpAt,
        },
        projector: {
          id: booking.projector_id,
          physical_status: "BORROWED",
        },
      };
      mockStaffIdempotencyStore.set(`pickup:${idempotencyKey}`, { payloadHash, result });
      return wrapMockSingle(result);
    },
  },

  maintenance: {
    async listMaintenance(params) {
      const scenario = await simulateMockRequest();
      requireStaffOrAdminMock();
      if (scenario === "empty") {
        return wrapMockList([], params?.page ?? 1, params?.page_size ?? 20);
      }

      const filtered = mockMaintenanceStore.filter((item) => {
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
    async createMaintenance(projectorId, payload) {
      await simulateMockRequest();
      requireStaffOrAdminMock();

      const projIndex = mockProjectorsStore.findIndex((p) => p.id === projectorId);
      const projector = projIndex >= 0 ? mockProjectorsStore[projIndex] : undefined;
      if (!projector) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          requestId: createMockRequestId(),
        });
      }
      if (projector.physical_status === "BORROWED") {
        throw new ApiClientError({
          status: 409,
          code: "PROJECTOR_HAS_ACTIVE_LOAN",
          requestId: createMockRequestId(),
        });
      }

      mockProjectorsStore[projIndex] = {
        ...projector,
        physical_status: "MAINTENANCE",
      };

      const record: MaintenanceRecord = {
        id: `sim_maint_${Date.now().toString(36)}`,
        projector_id: projectorId,
        reason: payload.reason,
        note: payload.note ?? null,
        status: "IN_PROGRESS",
        started_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        resolution_note: null,
        completed_at: null,
      };
      mockMaintenanceStore.unshift(record);
      return wrapMockSingle(record);
    },
    async completeMaintenance(maintenanceId, payload) {
      await simulateMockRequest();
      requireStaffOrAdminMock();

      const maintIndex = mockMaintenanceStore.findIndex((m) => m.id === maintenanceId);
      const record = maintIndex >= 0 ? mockMaintenanceStore[maintIndex] : undefined;
      if (!record) {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: `Simulasi: catatan maintenance ${maintenanceId} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }

      const hasActiveLoan = mockLoansStore.some(
        (l) => l.projector_id === record.projector_id && l.status === "ACTIVE"
      );
      if (payload.set_projector_available && hasActiveLoan) {
        throw new ApiClientError({
          status: 409,
          code: "PROJECTOR_HAS_ACTIVE_LOAN",
          requestId: createMockRequestId(),
        });
      }

      const completedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const updated: MaintenanceRecord = {
        ...record,
        status: "COMPLETED",
        resolution_note: payload.resolution_note,
        completed_at: completedAt,
      };
      mockMaintenanceStore[maintIndex] = updated;

      if (payload.set_projector_available) {
        const projIndex = mockProjectorsStore.findIndex((p) => p.id === record.projector_id);
        if (projIndex >= 0 && mockProjectorsStore[projIndex]) {
          mockProjectorsStore[projIndex] = {
            ...mockProjectorsStore[projIndex],
            physical_status: "AVAILABLE",
          };
        }
      }

      return wrapMockSingle(updated);
    },
  },

  operatingHours: {
    async getOperatingHours(date) {
      const scenario = await simulateMockRequest();
      if (scenario === "empty") {
        throw new ApiClientError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: `Konfigurasi jam operasional untuk tanggal ${date} tidak ditemukan.`,
          requestId: createMockRequestId(),
        });
      }
      return wrapMockSingle(getMockOperatingHoursForDate(date));
    },
    async updateOperatingHours(date, payload) {
      await simulateMockRequest();
      requireAdminMock();

      if (payload.closes_at <= payload.opens_at) {
        throw new ApiClientError({
          status: 422,
          code: "BOOKING_TIME_INVALID",
          message: "Jam tutup harus lebih akhir dari jam buka.",
          requestId: createMockRequestId(),
        });
      }

      const openUtc = new Date(`${date}T${payload.opens_at}+07:00`);
      const closeUtc = new Date(`${date}T${payload.closes_at}+07:00`);
      const conflicts = mockBookingsStore.filter((booking) => {
        if (booking.booking_date !== date || booking.status !== "CONFIRMED") return false;
        const startUtc = new Date(`${booking.booking_date}T${booking.start_time}+07:00`);
        const endUtc = new Date(booking.estimated_return_at);
        return startUtc < openUtc || endUtc > closeUtc;
      });

      if (conflicts.length > 0) {
        throw new ApiClientError({
          status: 409,
          code: "OPERATING_HOURS_CONFLICT",
          message: "Perubahan jam operasional bertabrakan dengan booking aktif.",
          details: conflicts.map((b) => ({
            field: b.booking_code,
            reason: `Jadwal ${b.start_time.slice(0, 5)}–${new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Jakarta",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(new Date(b.estimated_return_at))} WIB berada di luar jam layanan baru.`,
          })),
          requestId: createMockRequestId(),
        });
      }

      const earlyAllowed = payload.admin_early_open_at
        ? addMinutesToTimeString(payload.admin_early_open_at, 30)
        : addMinutesToTimeString(payload.opens_at, -15);

      const saved: OperatingHoursSnapshot = {
        service_date: date,
        timezone: "Asia/Jakarta",
        opens_at: payload.opens_at,
        closes_at: payload.closes_at,
        configured_open_at: payload.opens_at,
        early_pickup_allowed_at: earlyAllowed,
      };
      mockOperatingHoursStore.set(date, saved);
      return wrapMockSingle(saved);
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
      const scenario = await simulateMockRequest();
      requireStaffOrAdminMock();
      if (scenario === "empty") {
        return wrapMockSingle({
          bookings_today_count: 0,
          pending_pickup_count: 0,
          active_loans_count: 0,
          overdue_loans_count: 0,
          maintenance_units_count: 0,
          pending_pickups: [],
          active_loans: [],
          maintenance_units: [],
          recent_activities: [],
        });
      }

      const pendingPickups = mockBookingsStore.filter((b) => b.status === "CONFIRMED");
      const activeLoans = mockLoansStore.filter((l) => l.status === "ACTIVE");
      const maintenanceUnits = mockProjectorsStore.filter(
        (p) => p.physical_status === "MAINTENANCE"
      );

      return wrapMockSingle({
        bookings_today_count: mockBookingsStore.length,
        pending_pickup_count: pendingPickups.length,
        active_loans_count: activeLoans.length,
        overdue_loans_count: 0,
        maintenance_units_count: maintenanceUnits.length,
        pending_pickups: pendingPickups,
        active_loans: activeLoans,
        maintenance_units: maintenanceUnits,
        recent_activities: [
          {
            id: "sim_act_1",
            message:
              "Simulasi: gunakan token sim_qr_pickup_ready_01 untuk uji pickup atau sim_qr_return_active_01 untuk uji return.",
            timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
          },
        ],
      });
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

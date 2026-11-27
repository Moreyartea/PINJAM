import "server-only";

import type { PaginationMeta } from "@/lib/api/types";
import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { parseListQuery, parseUuidParam } from "@/lib/http/request";
import {
  createSupabaseIdentityStorageAdapter,
  type IdentityStorageAdapter,
} from "@/lib/storage/identity-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { KomtingApplicationRow } from "@/lib/supabase/database.types";
import type { ApplicationStatus, KomtingApplication } from "@/types/domain";

const VALID_APPLICATION_STATUSES = new Set<ApplicationStatus>([
  "PENDING_EMAIL_VERIFICATION",
  "PENDING_VERIFICATION",
  "PENDING_REVIEW",
  "PENDING_REPLACEMENT_NOTICE",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);

const ACTIVE_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "PENDING_EMAIL_VERIFICATION",
  "PENDING_VERIFICATION",
  "PENDING_REVIEW",
  "PENDING_REPLACEMENT_NOTICE",
];

export interface AdminApplicationDetail extends KomtingApplication {
  has_identity_photo: boolean;
  identity_photo_signed_url: string | null;
}

export interface ApprovalResult {
  application_id: string;
  status: string;
  assignment: {
    id: string;
    status: string;
    class_name: string;
  };
}

export interface KomtingApplicationListItem extends KomtingApplication {
  has_identity_photo: boolean;
}

export interface KomtingWorkflowRepository {
  hasActiveAssignmentForUser(userId: string): Promise<boolean>;
  hasActiveAssignmentForClass(className: string): Promise<boolean>;
  hasActiveApplicationForUser(userId: string): Promise<boolean>;
  createApplication(params: {
    userId: string;
    recipientEmail: string;
    studentId: string;
    className: string;
    identityPhotoStorageKey: string;
    applicationType: "NEW" | "REPLACEMENT";
    requestId: string;
  }): Promise<KomtingApplicationRow>;
  getLatestApplicationForUser(userId: string): Promise<{
    application: KomtingApplicationRow;
    fullName: string;
    email: string;
  } | null>;
  listApplications(params: {
    status?: ApplicationStatus;
    page: number;
    pageSize: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }): Promise<{
    items: Array<{ application: KomtingApplicationRow; fullName: string; email: string }>;
    totalItems: number;
  }>;
  getApplicationById(applicationId: string): Promise<{
    application: KomtingApplicationRow;
    fullName: string;
    email: string;
  } | null>;
  approveApplicationAtomic(params: {
    applicationId: string;
    adminUserId: string;
    adminNote: string | null;
    requestId: string;
  }): Promise<ApprovalResult>;
  rejectApplicationAtomic(params: {
    applicationId: string;
    adminUserId: string;
    reason: string;
    requestId: string;
  }): Promise<KomtingApplication>;
  approveReplacementAtomic(params: {
    applicationId: string;
    adminUserId: string;
    adminNote: string | null;
    requestId: string;
  }): Promise<ApprovalResult>;
  deactivateAssignmentAtomic(params: {
    assignmentId: string;
    adminUserId: string;
    reason: string;
    requestId: string;
  }): Promise<{ success: boolean }>;
}

export interface KomtingServiceDeps {
  repository?: KomtingWorkflowRepository;
  storage?: IdentityStorageAdapter;
}

function mapApplicationRow(
  row: KomtingApplicationRow,
  userMeta?: { fullName?: string; email?: string }
): KomtingApplication {
  return {
    application_id: row.id,
    ...(userMeta?.fullName ? { full_name: userMeta.fullName } : {}),
    ...(userMeta?.email ? { email: userMeta.email } : {}),
    student_id: row.student_id,
    class_name: row.class_name,
    application_type: row.application_type,
    status: row.status,
    submitted_at: row.submitted_at,
    admin_note: row.admin_note,
    rejection_reason: row.rejection_reason,
  };
}

function mapDatabaseErrorToAuthError(error: { code?: string; message: string }): AuthError {
  const msg = error.message;

  if (msg.includes("PINJAM_ERR:APPLICATION_NOT_FOUND")) {
    return new AuthError({
      status: 404,
      code: "NOT_FOUND",
      message: "Pengajuan komting tidak ditemukan.",
    });
  }
  if (msg.includes("PINJAM_ERR:ASSIGNMENT_NOT_FOUND")) {
    return new AuthError({
      status: 404,
      code: "NOT_FOUND",
      message: "Penugasan komting tidak ditemukan.",
    });
  }
  if (
    msg.includes("PINJAM_ERR:APPLICATION_ALREADY_EXISTS") ||
    msg.includes("uq_komting_applications_active_per_user")
  ) {
    return new AuthError({
      status: 409,
      code: "APPLICATION_ALREADY_EXISTS",
      message: "Pengajuan komting aktif sudah terdaftar.",
    });
  }
  if (
    msg.includes("PINJAM_ERR:CLASS_ALREADY_HAS_ACTIVE_KOMTING") ||
    msg.includes("uq_komting_assignments_active_class")
  ) {
    return new AuthError({
      status: 409,
      code: "CLASS_ALREADY_HAS_ACTIVE_KOMTING",
      message: "Kelas ini sudah memiliki komting aktif.",
    });
  }
  if (
    msg.includes("PINJAM_ERR:STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT") ||
    msg.includes("uq_komting_assignments_active_user")
  ) {
    return new AuthError({
      status: 409,
      code: "STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT",
      message: "Mahasiswa sudah memiliki penugasan komting aktif.",
    });
  }
  if (msg.includes("PINJAM_ERR:APPLICATION_STATUS_INVALID")) {
    return new AuthError({
      status: 409,
      code: "APPLICATION_STATUS_INVALID",
      message: "Status pengajuan saat ini tidak mengizinkan aksi tersebut.",
    });
  }
  if (msg.includes("PINJAM_ERR:ASSIGNMENT_NOT_ACTIVE")) {
    return new AuthError({
      status: 409,
      code: "ASSIGNMENT_NOT_ACTIVE",
      message: "Penugasan komting sudah tidak aktif.",
    });
  }
  if (msg.includes("PINJAM_ERR:ACCOUNT_NOT_ACTIVE")) {
    return new AuthError({
      status: 403,
      code: "ACCOUNT_NOT_ACTIVE",
      message: "Akun pemohon tidak memenuhi syarat status aktif.",
    });
  }
  if (msg.includes("PINJAM_ERR:FORBIDDEN")) {
    return new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Pemohon tidak memiliki role KOMTING.",
    });
  }
  if (msg.includes("PINJAM_ERR:INVALID_REASON")) {
    return new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Alasan wajib diisi.",
      details: [{ field: "reason", reason: "REQUIRED" }],
    });
  }

  return new AuthError({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Terjadi kesalahan internal saat memproses alur komting.",
  });
}

export function createSupabaseKomtingWorkflowRepository(): KomtingWorkflowRepository {
  const admin = createSupabaseAdminClient();

  return {
    async hasActiveAssignmentForUser(userId) {
      const { data, error } = await admin
        .from("komting_assignments")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw mapDatabaseErrorToAuthError(error);
      return Boolean(data);
    },

    async hasActiveAssignmentForClass(className) {
      const { data, error } = await admin
        .from("komting_assignments")
        .select("id")
        .ilike("class_name", className.trim())
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw mapDatabaseErrorToAuthError(error);
      return Boolean(data);
    },

    async hasActiveApplicationForUser(userId) {
      const { data, error } = await admin
        .from("komting_applications")
        .select("id")
        .eq("user_id", userId)
        .in("status", [...ACTIVE_APPLICATION_STATUSES])
        .maybeSingle();

      if (error) throw mapDatabaseErrorToAuthError(error);
      return Boolean(data);
    },

    async createApplication({
      userId,
      recipientEmail,
      studentId,
      className,
      identityPhotoStorageKey,
      applicationType,
      requestId,
    }) {
      const { data, error } = await admin
        .from("komting_applications")
        .insert({
          user_id: userId,
          student_id: studentId,
          class_name: className,
          identity_photo_storage_key: identityPhotoStorageKey,
          application_type: applicationType,
          status: "PENDING_VERIFICATION",
        })
        .select("*")
        .single();

      if (error || !data) {
        throw mapDatabaseErrorToAuthError(error ?? { message: "Insert application failed" });
      }

      await admin.from("audit_logs").insert({
        actor_user_id: userId,
        actor_role: "KOMTING",
        actor_source: "API",
        action: "KOMTING_APPLICATION_SUBMITTED",
        entity_type: "KOMTING_APPLICATION",
        entity_id: data.id,
        after_data: {
          class_name: data.class_name,
          application_type: data.application_type,
          status: data.status,
        },
        request_id: requestId,
      });

      try {
        await admin.from("email_outbox").insert({
          event_type: "KOMTING_APPLICATION_SUBMITTED",
          recipient: recipientEmail,
          payload: {
            application_id: data.id,
            class_name: data.class_name,
            application_type: data.application_type,
          },
          deduplication_key: `komting-app-submitted:${data.id}`,
        });
      } catch {
        // Non-fatal: email outbox enqueue failure must not fail an already committed submission
      }

      return data;
    },

    async getLatestApplicationForUser(userId) {
      const { data: app, error } = await admin
        .from("komting_applications")
        .select("*")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw mapDatabaseErrorToAuthError(error);
      if (!app) return null;

      const { data: userRow } = await admin
        .from("users")
        .select("full_name, email")
        .eq("id", userId)
        .maybeSingle();

      return {
        application: app,
        fullName: userRow?.full_name ?? "",
        email: userRow?.email ?? "",
      };
    },

    async listApplications({ status, page, pageSize, sortBy, sortOrder }) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin
        .from("komting_applications")
        .select("*", { count: "exact" })
        .order(sortBy, { ascending: sortOrder === "asc" })
        .range(from, to);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, count, error } = await query;
      if (error) throw mapDatabaseErrorToAuthError(error);

      const rows = data ?? [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const usersMap = new Map<string, { fullName: string; email: string }>();

      if (userIds.length > 0) {
        const { data: userRows } = await admin
          .from("users")
          .select("id, full_name, email")
          .in("id", userIds);

        for (const u of userRows ?? []) {
          usersMap.set(u.id, { fullName: u.full_name, email: u.email });
        }
      }

      return {
        items: rows.map((row) => ({
          application: row,
          fullName: usersMap.get(row.user_id)?.fullName ?? "",
          email: usersMap.get(row.user_id)?.email ?? "",
        })),
        totalItems: count ?? rows.length,
      };
    },

    async getApplicationById(applicationId) {
      const { data: app, error } = await admin
        .from("komting_applications")
        .select("*")
        .eq("id", applicationId)
        .maybeSingle();

      if (error) throw mapDatabaseErrorToAuthError(error);
      if (!app) return null;

      const { data: userRow } = await admin
        .from("users")
        .select("full_name, email")
        .eq("id", app.user_id)
        .maybeSingle();

      return {
        application: app,
        fullName: userRow?.full_name ?? "",
        email: userRow?.email ?? "",
      };
    },

    async approveApplicationAtomic({ applicationId, adminUserId, adminNote, requestId }) {
      const { data, error } = await admin.rpc("rpc_admin_approve_komting_application", {
        p_application_id: applicationId,
        p_admin_user_id: adminUserId,
        p_admin_note: adminNote,
        p_request_id: requestId,
      });

      if (error) throw mapDatabaseErrorToAuthError(error);
      return data as unknown as ApprovalResult;
    },

    async rejectApplicationAtomic({ applicationId, adminUserId, reason, requestId }) {
      const { data, error } = await admin.rpc("rpc_admin_reject_komting_application", {
        p_application_id: applicationId,
        p_admin_user_id: adminUserId,
        p_reason: reason,
        p_request_id: requestId,
      });

      if (error) throw mapDatabaseErrorToAuthError(error);
      return data as unknown as KomtingApplication;
    },

    async approveReplacementAtomic({ applicationId, adminUserId, adminNote, requestId }) {
      const { data, error } = await admin.rpc("rpc_admin_approve_komting_replacement", {
        p_application_id: applicationId,
        p_admin_user_id: adminUserId,
        p_admin_note: adminNote,
        p_request_id: requestId,
      });

      if (error) throw mapDatabaseErrorToAuthError(error);
      return data as unknown as ApprovalResult;
    },

    async deactivateAssignmentAtomic({ assignmentId, adminUserId, reason, requestId }) {
      const { data, error } = await admin.rpc("rpc_admin_deactivate_komting_assignment", {
        p_assignment_id: assignmentId,
        p_admin_user_id: adminUserId,
        p_reason: reason,
        p_request_id: requestId,
      });

      if (error) throw mapDatabaseErrorToAuthError(error);
      const parsed = data as { success?: boolean } | null;
      return { success: Boolean(parsed?.success ?? true) };
    },
  };
}

function getFormString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function submitKomtingApplication(
  context: AuthenticatedUserContext,
  formData: FormData,
  requestId: string,
  deps: KomtingServiceDeps = {}
): Promise<{
  application_id: string;
  status: string;
  submitted_at: string;
}> {
  const repository = deps.repository ?? createSupabaseKomtingWorkflowRepository();
  const storage = deps.storage ?? createSupabaseIdentityStorageAdapter();

  const fullName = getFormString(formData, "full_name");
  const email = getFormString(formData, "email").toLowerCase();
  const studentId = getFormString(formData, "student_id");
  const className = getFormString(formData, "class_name");
  const identityPhoto = formData.get("identity_photo");

  const missingDetails: Array<{ field: string; reason: string }> = [];
  if (!fullName) missingDetails.push({ field: "full_name", reason: "REQUIRED" });
  if (!email) missingDetails.push({ field: "email", reason: "REQUIRED" });
  if (!studentId) missingDetails.push({ field: "student_id", reason: "REQUIRED" });
  if (!className) missingDetails.push({ field: "class_name", reason: "REQUIRED" });
  if (!(identityPhoto instanceof File)) {
    missingDetails.push({ field: "identity_photo", reason: "REQUIRED" });
  }

  if (missingDetails.length > 0) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Data pengajuan komting belum lengkap.",
      details: missingDetails,
    });
  }

  if (email !== context.user.email.trim().toLowerCase()) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Email pengajuan harus sesuai dengan email akun yang sedang login.",
      details: [{ field: "email", reason: "EMAIL_MISMATCH" }],
    });
  }

  if (await repository.hasActiveAssignmentForUser(context.user.id)) {
    throw new AuthError({
      status: 409,
      code: "STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT",
      message: "Mahasiswa sudah memiliki penugasan komting aktif.",
    });
  }

  if (await repository.hasActiveApplicationForUser(context.user.id)) {
    throw new AuthError({
      status: 409,
      code: "APPLICATION_ALREADY_EXISTS",
      message: "Pengajuan komting aktif sudah terdaftar.",
    });
  }

  const classAlreadyHasKomting = await repository.hasActiveAssignmentForClass(className);
  const applicationType = classAlreadyHasKomting ? "REPLACEMENT" : "NEW";

  const uploaded = await storage.uploadIdentityPhoto({
    userId: context.user.id,
    file: identityPhoto as File,
  });

  try {
    const created = await repository.createApplication({
      userId: context.user.id,
      recipientEmail: context.user.email,
      studentId,
      className,
      identityPhotoStorageKey: uploaded.storageKey,
      applicationType,
      requestId,
    });

    return {
      application_id: created.id,
      status: created.status,
      submitted_at: created.submitted_at,
    };
  } catch (error) {
    await storage.deleteIdentityPhoto(uploaded.storageKey).catch(() => null);
    throw error;
  }
}

export async function getMyKomtingApplication(
  context: AuthenticatedUserContext,
  deps: KomtingServiceDeps = {}
): Promise<KomtingApplication> {
  const repository = deps.repository ?? createSupabaseKomtingWorkflowRepository();
  const result = await repository.getLatestApplicationForUser(context.user.id);

  if (!result) {
    throw new AuthError({
      status: 404,
      code: "NOT_FOUND",
      message: "Belum ada pengajuan komting untuk akun ini.",
    });
  }

  return mapApplicationRow(result.application, {
    fullName: result.fullName,
    email: result.email,
  });
}

export async function listAdminKomtingApplications(
  requestUrl: string,
  deps: KomtingServiceDeps = {}
): Promise<{ items: KomtingApplicationListItem[]; pagination: PaginationMeta }> {
  const repository = deps.repository ?? createSupabaseKomtingWorkflowRepository();
  const parsed = parseListQuery(requestUrl, {
    allowedSortBy: ["submitted_at", "created_at", "status", "class_name"],
    defaultSortBy: "submitted_at",
  });

  const rawStatus = parsed.searchParams.get("status")?.trim() ?? "";
  let statusFilter: ApplicationStatus | undefined;

  if (rawStatus) {
    if (!VALID_APPLICATION_STATUSES.has(rawStatus as ApplicationStatus)) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Filter status pengajuan tidak valid.",
        details: [{ field: "status", reason: "INVALID_ENUM" }],
      });
    }
    statusFilter = rawStatus as ApplicationStatus;
  }

  const { items, totalItems } = await repository.listApplications({
    status: statusFilter,
    page: parsed.page,
    pageSize: parsed.pageSize,
    sortBy: parsed.sortBy,
    sortOrder: parsed.sortOrder,
  });

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / parsed.pageSize);

  return {
    items: items.map(({ application, fullName, email }) => ({
      ...mapApplicationRow(application, { fullName, email }),
      has_identity_photo: Boolean(application.identity_photo_storage_key),
    })),
    pagination: {
      page: parsed.page,
      page_size: parsed.pageSize,
      total_items: totalItems,
      total_pages: totalPages,
    },
  };
}

export async function getAdminKomtingApplicationDetail(
  applicationIdParam: string,
  deps: KomtingServiceDeps = {}
): Promise<AdminApplicationDetail> {
  const applicationId = parseUuidParam(applicationIdParam, "application_id");
  const repository = deps.repository ?? createSupabaseKomtingWorkflowRepository();
  const storage = deps.storage ?? createSupabaseIdentityStorageAdapter();

  const found = await repository.getApplicationById(applicationId);
  if (!found) {
    throw new AuthError({
      status: 404,
      code: "NOT_FOUND",
      message: "Pengajuan komting tidak ditemukan.",
    });
  }

  const signedUrl = found.application.identity_photo_storage_key
    ? await storage.createSignedPhotoUrl(found.application.identity_photo_storage_key, 120)
    : null;

  return {
    ...mapApplicationRow(found.application, {
      fullName: found.fullName,
      email: found.email,
    }),
    has_identity_photo: Boolean(found.application.identity_photo_storage_key),
    identity_photo_signed_url: signedUrl,
    identity_photo_url: signedUrl,
  };
}

function parseOptionalNoteBody(rawBody: unknown): string | null {
  if (rawBody === null || rawBody === undefined) {
    return null;
  }
  if (typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Body permintaan harus berupa objek JSON.",
    });
  }

  const note = (rawBody as { admin_note?: unknown }).admin_note;
  if (note === undefined || note === null) {
    return null;
  }
  if (typeof note !== "string") {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "admin_note harus berupa teks.",
      details: [{ field: "admin_note", reason: "INVALID_TYPE" }],
    });
  }
  const trimmed = note.trim();
  return trimmed || null;
}

function parseRequiredReasonBody(rawBody: unknown): string {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Body permintaan harus berupa objek JSON.",
    });
  }

  const reason = (rawBody as { reason?: unknown }).reason;
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Alasan wajib diisi.",
      details: [{ field: "reason", reason: "REQUIRED" }],
    });
  }

  return reason.trim();
}

export async function approveKomtingApplication(
  context: AuthenticatedUserContext,
  applicationIdParam: string,
  rawBody: unknown,
  requestId: string,
  deps: KomtingServiceDeps = {}
): Promise<ApprovalResult> {
  const applicationId = parseUuidParam(applicationIdParam, "application_id");
  const adminNote = parseOptionalNoteBody(rawBody);
  const repository = deps.repository ?? createSupabaseKomtingWorkflowRepository();

  return repository.approveApplicationAtomic({
    applicationId,
    adminUserId: context.user.id,
    adminNote,
    requestId,
  });
}

export async function rejectKomtingApplication(
  context: AuthenticatedUserContext,
  applicationIdParam: string,
  rawBody: unknown,
  requestId: string,
  deps: KomtingServiceDeps = {}
): Promise<KomtingApplication> {
  const applicationId = parseUuidParam(applicationIdParam, "application_id");
  const reason = parseRequiredReasonBody(rawBody);
  const repository = deps.repository ?? createSupabaseKomtingWorkflowRepository();

  return repository.rejectApplicationAtomic({
    applicationId,
    adminUserId: context.user.id,
    reason,
    requestId,
  });
}

export async function approveKomtingReplacement(
  context: AuthenticatedUserContext,
  applicationIdParam: string,
  rawBody: unknown,
  requestId: string,
  deps: KomtingServiceDeps = {}
): Promise<ApprovalResult> {
  const applicationId = parseUuidParam(applicationIdParam, "application_id");
  const adminNote = parseOptionalNoteBody(rawBody);
  const repository = deps.repository ?? createSupabaseKomtingWorkflowRepository();

  return repository.approveReplacementAtomic({
    applicationId,
    adminUserId: context.user.id,
    adminNote,
    requestId,
  });
}

export async function deactivateKomtingAssignment(
  context: AuthenticatedUserContext,
  assignmentIdParam: string,
  rawBody: unknown,
  requestId: string,
  deps: KomtingServiceDeps = {}
): Promise<{ success: boolean }> {
  const assignmentId = parseUuidParam(assignmentIdParam, "assignment_id");
  const reason = parseRequiredReasonBody(rawBody);
  const repository = deps.repository ?? createSupabaseKomtingWorkflowRepository();

  return repository.deactivateAssignmentAtomic({
    assignmentId,
    adminUserId: context.user.id,
    reason,
    requestId,
  });
}

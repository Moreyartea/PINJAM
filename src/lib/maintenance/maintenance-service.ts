import "server-only";

import type { PaginationMeta } from "@/lib/api/types";
import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { parseListQuery, parseUuidParam } from "@/lib/http/request";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  validateCompleteMaintenanceForm,
  validateStartMaintenanceForm,
} from "@/lib/validation/staff";
import type { MaintenanceRecord, MaintenanceStatus } from "@/types/domain";

export interface MaintenanceRecordRow {
  id: string;
  projector_id: string;
  reason: string;
  note: string | null;
  status: MaintenanceStatus;
  created_by: string;
  started_at: string;
  resolution_note: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MaintenanceRepository {
  listMaintenance(params: {
    status?: MaintenanceStatus;
    page: number;
    pageSize: number;
  }): Promise<{ items: MaintenanceRecord[]; totalItems: number }>;

  getMaintenanceById(id: string): Promise<MaintenanceRecordRow | null>;

  startMaintenance(params: {
    projectorId: string;
    reason: string;
    note?: string | null;
    staffUserId: string;
    staffRole: "STAFF" | "ADMIN";
    requestId: string;
  }): Promise<MaintenanceRecord>;

  completeMaintenance(params: {
    maintenanceId: string;
    resolutionNote: string;
    setProjectorAvailable: boolean;
    staffUserId: string;
    staffRole: "STAFF" | "ADMIN";
    requestId: string;
  }): Promise<MaintenanceRecord>;
}

export interface MaintenanceServiceDeps {
  repository?: MaintenanceRepository;
}

function parseJsonObject(rawBody: unknown): Record<string, unknown> {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Body permintaan harus berupa objek JSON yang valid.",
    });
  }
  return rawBody as Record<string, unknown>;
}

export function createSupabaseMaintenanceRepository(
  adminClient?: ReturnType<typeof createSupabaseAdminClient>
): MaintenanceRepository {
  const admin = adminClient ?? createSupabaseAdminClient();

  return {
    async listMaintenance(params) {
      let query = admin.from("maintenance_records").select("*", { count: "exact" });

      if (params.status) {
        query = query.eq("status", params.status);
      }

      query = query.order("started_at", { ascending: false });

      const page = Math.max(1, params.page);
      const pageSize = Math.min(100, Math.max(1, params.pageSize));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal memuat catatan maintenance: ${error.message}`,
        });
      }

      const items: MaintenanceRecord[] = (data ?? []).map((row) => ({
        id: row.id,
        projector_id: row.projector_id,
        reason: row.reason,
        note: row.note,
        status: row.status as MaintenanceStatus,
        started_at: row.started_at,
        resolution_note: row.resolution_note,
        completed_at: row.completed_at,
      }));

      return {
        items,
        totalItems: count ?? 0,
      };
    },

    async getMaintenanceById(id: string) {
      const { data, error } = await admin
        .from("maintenance_records")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal memuat catatan maintenance: ${error.message}`,
        });
      }

      return data as MaintenanceRecordRow | null;
    },

    async startMaintenance(params) {
      // 1. Fetch projector and check status
      const { data: projector, error: projErr } = await admin
        .from("projectors")
        .select("*")
        .eq("id", params.projectorId)
        .maybeSingle();

      if (projErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal memeriksa status proyektor: ${projErr.message}`,
        });
      }

      if (!projector) {
        throw new AuthError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: "Unit proyektor tidak ditemukan.",
          details: [{ field: "projectorId", reason: "NOT_FOUND" }],
        });
      }

      if (!projector.is_active) {
        throw new AuthError({
          status: 400,
          code: "PROJECTOR_INACTIVE",
          message: "Proyektor tidak aktif dan tidak dapat dimasukkan ke maintenance.",
          details: [{ field: "projectorId", reason: "INACTIVE" }],
        });
      }

      if (projector.physical_status === "BORROWED") {
        throw new AuthError({
          status: 409,
          code: "PROJECTOR_BORROWED",
          message: "Proyektor sedang dipinjam dan tidak dapat dimasukkan ke status maintenance.",
          details: [{ field: "physical_status", reason: "ALREADY_BORROWED" }],
        });
      }

      // 2. Check no active loan on this projector
      const { data: activeLoans, error: loanErr } = await admin
        .from("loans")
        .select("id")
        .eq("projector_id", params.projectorId)
        .eq("status", "ACTIVE")
        .limit(1);

      if (loanErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal memeriksa pinjaman aktif: ${loanErr.message}`,
        });
      }

      if (activeLoans && activeLoans.length > 0) {
        throw new AuthError({
          status: 409,
          code: "ACTIVE_LOAN_EXISTS",
          message: "Proyektor memiliki pinjaman aktif dan tidak dapat dimasukkan ke status maintenance.",
          details: [{ field: "projectorId", reason: "ACTIVE_LOAN_EXISTS" }],
        });
      }

      // 3. Check no active maintenance record on this projector
      const { data: activeMaint, error: maintCheckErr } = await admin
        .from("maintenance_records")
        .select("id")
        .eq("projector_id", params.projectorId)
        .eq("status", "IN_PROGRESS")
        .limit(1);

      if (maintCheckErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal memeriksa catatan maintenance aktif: ${maintCheckErr.message}`,
        });
      }

      if (activeMaint && activeMaint.length > 0) {
        throw new AuthError({
          status: 409,
          code: "MAINTENANCE_ALREADY_ACTIVE",
          message: "Unit proyektor sudah dalam status pemeliharaan (IN_PROGRESS).",
          details: [{ field: "projectorId", reason: "ALREADY_IN_MAINTENANCE" }],
        });
      }

      // 4. Update projector status to MAINTENANCE first (satisfies verify_maintenance_against_projector trigger)
      const { error: updateProjErr } = await admin
        .from("projectors")
        .update({ physical_status: "MAINTENANCE" })
        .eq("id", params.projectorId);

      if (updateProjErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal memperbarui status fisik proyektor ke MAINTENANCE: ${updateProjErr.message}`,
        });
      }

      // 5. Insert maintenance record
      const nowIso = new Date().toISOString();
      const { data: record, error: insertErr } = await admin
        .from("maintenance_records")
        .insert({
          projector_id: params.projectorId,
          reason: params.reason.trim(),
          note: params.note?.trim() || null,
          status: "IN_PROGRESS",
          created_by: params.staffUserId,
          started_at: nowIso,
        })
        .select("*")
        .single();

      if (insertErr || !record) {
        // Revert projector status back if insert fails
        await admin
          .from("projectors")
          .update({ physical_status: projector.physical_status })
          .eq("id", params.projectorId);

        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal menyimpan catatan maintenance: ${insertErr?.message ?? "unknown"}`,
        });
      }

      // 6. Record audit log
      await admin.from("audit_logs").insert({
        actor_user_id: params.staffUserId,
        actor_role: params.staffRole,
        actor_source: "API",
        action: "PROJECTOR_MAINTENANCE",
        entity_type: "PROJECTOR",
        entity_id: params.projectorId,
        before_data: {
          physical_status: projector.physical_status,
        },
        after_data: {
          physical_status: "MAINTENANCE",
          maintenance_id: record.id,
          reason: record.reason,
          note: record.note,
        },
        request_id: params.requestId,
      });

      return {
        id: record.id,
        projector_id: record.projector_id,
        reason: record.reason,
        note: record.note,
        status: record.status as MaintenanceStatus,
        started_at: record.started_at,
        resolution_note: record.resolution_note,
        completed_at: record.completed_at,
      };
    },

    async completeMaintenance(params) {
      // 1. Fetch maintenance record
      const { data: maintRecord, error: maintErr } = await admin
        .from("maintenance_records")
        .select("*")
        .eq("id", params.maintenanceId)
        .maybeSingle();

      if (maintErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal mencari catatan maintenance: ${maintErr.message}`,
        });
      }

      if (!maintRecord) {
        throw new AuthError({
          status: 404,
          code: "MAINTENANCE_NOT_FOUND",
          message: "Catatan maintenance tidak ditemukan.",
          details: [{ field: "maintenanceId", reason: "NOT_FOUND" }],
        });
      }

      if (maintRecord.status !== "IN_PROGRESS") {
        throw new AuthError({
          status: 409,
          code: "MAINTENANCE_ALREADY_COMPLETED",
          message: "Catatan pemeliharaan sudah selesai sebelumnya.",
          details: [{ field: "status", reason: "ALREADY_COMPLETED" }],
        });
      }

      const nowIso = new Date().toISOString();

      // 2. Update maintenance record to COMPLETED
      const { data: updatedRecord, error: updateErr } = await admin
        .from("maintenance_records")
        .update({
          status: "COMPLETED",
          resolution_note: params.resolutionNote.trim(),
          completed_by: params.staffUserId,
          completed_at: nowIso,
        })
        .eq("id", params.maintenanceId)
        .select("*")
        .single();

      if (updateErr || !updatedRecord) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal menyelesaikan catatan maintenance: ${updateErr?.message ?? "unknown"}`,
        });
      }

      // 3. If setProjectorAvailable, verify no active loan and set AVAILABLE
      if (params.setProjectorAvailable) {
        const { data: activeLoans } = await admin
          .from("loans")
          .select("id")
          .eq("projector_id", maintRecord.projector_id)
          .eq("status", "ACTIVE")
          .limit(1);

        if (!activeLoans || activeLoans.length === 0) {
          const { error: projUpErr } = await admin
            .from("projectors")
            .update({ physical_status: "AVAILABLE" })
            .eq("id", maintRecord.projector_id);

          if (projUpErr) {
            console.error("Gagal memperbarui status proyektor ke AVAILABLE:", projUpErr);
          }
        }
      }

      // 4. Record audit log
      await admin.from("audit_logs").insert({
        actor_user_id: params.staffUserId,
        actor_role: params.staffRole,
        actor_source: "API",
        action: "MAINTENANCE_COMPLETED",
        entity_type: "MAINTENANCE",
        entity_id: params.maintenanceId,
        before_data: {
          status: "IN_PROGRESS",
          projector_id: maintRecord.projector_id,
        },
        after_data: {
          status: "COMPLETED",
          resolution_note: updatedRecord.resolution_note,
          completed_by: params.staffUserId,
          completed_at: nowIso,
          set_projector_available: params.setProjectorAvailable,
        },
        request_id: params.requestId,
      });

      return {
        id: updatedRecord.id,
        projector_id: updatedRecord.projector_id,
        reason: updatedRecord.reason,
        note: updatedRecord.note,
        status: updatedRecord.status as MaintenanceStatus,
        started_at: updatedRecord.started_at,
        resolution_note: updatedRecord.resolution_note,
        completed_at: updatedRecord.completed_at,
      };
    },
  };
}

export async function listStaffMaintenance(
  context: AuthenticatedUserContext,
  requestUrl: string,
  deps: MaintenanceServiceDeps = {}
): Promise<{ items: MaintenanceRecord[]; pagination: PaginationMeta }> {
  const repository = deps.repository ?? createSupabaseMaintenanceRepository();
  const parsed = parseListQuery(requestUrl, {
    allowedSortBy: ["started_at", "status"],
    defaultSortBy: "started_at",
  });

  const rawStatus = parsed.searchParams.get("status")?.trim() ?? "";
  let status: MaintenanceStatus | undefined;
  if (rawStatus && rawStatus !== "ALL") {
    if (rawStatus !== "IN_PROGRESS" && rawStatus !== "COMPLETED") {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Filter status maintenance tidak valid (harus IN_PROGRESS atau COMPLETED).",
        details: [{ field: "status", reason: "INVALID_ENUM" }],
      });
    }
    status = rawStatus as MaintenanceStatus;
  }

  const { items, totalItems } = await repository.listMaintenance({
    status,
    page: parsed.page,
    pageSize: parsed.pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(totalItems / parsed.pageSize));

  return {
    items,
    pagination: {
      page: parsed.page,
      page_size: parsed.pageSize,
      total_items: totalItems,
      total_pages: totalPages,
    },
  };
}

export async function startStaffMaintenance(
  context: AuthenticatedUserContext,
  projectorId: string,
  rawBody: unknown,
  requestId: string,
  deps: MaintenanceServiceDeps = {}
): Promise<MaintenanceRecord> {
  const repository = deps.repository ?? createSupabaseMaintenanceRepository();
  const validProjectorId = parseUuidParam(projectorId, "projectorId");
  const body = parseJsonObject(rawBody);

  const reasonRaw = body.reason;
  if (typeof reasonRaw !== "string") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Alasan maintenance wajib diisi dalam bentuk teks.",
      details: [{ field: "reason", reason: "REQUIRED_FIELD" }],
    });
  }

  const validation = validateStartMaintenanceForm({ reason: reasonRaw });
  if (validation.reason) {
    throw new AuthError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: validation.reason,
      details: [{ field: "reason", reason: "VALIDATION_FAILED" }],
    });
  }

  let note: string | null = null;
  if ("note" in body) {
    if (body.note !== null && typeof body.note !== "string") {
      throw new AuthError({
        status: 422,
        code: "INVALID_REQUEST",
        message: "Catatan harus berupa teks atau null.",
        details: [{ field: "note", reason: "INVALID_TYPE" }],
      });
    }
    note = body.note ? (body.note as string).trim() || null : null;
  }

  const staffRole = context.user.role === "ADMIN" ? "ADMIN" : "STAFF";

  return repository.startMaintenance({
    projectorId: validProjectorId,
    reason: reasonRaw.trim(),
    note,
    staffUserId: context.user.id,
    staffRole,
    requestId,
  });
}

export async function completeStaffMaintenance(
  context: AuthenticatedUserContext,
  maintenanceId: string,
  rawBody: unknown,
  requestId: string,
  deps: MaintenanceServiceDeps = {}
): Promise<MaintenanceRecord> {
  const repository = deps.repository ?? createSupabaseMaintenanceRepository();
  const validMaintenanceId = parseUuidParam(maintenanceId, "maintenanceId");
  const body = parseJsonObject(rawBody);

  const resolutionNoteRaw = body.resolution_note;
  if (typeof resolutionNoteRaw !== "string") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Catatan penyelesaian maintenance wajib diisi dalam bentuk teks.",
      details: [{ field: "resolution_note", reason: "REQUIRED_FIELD" }],
    });
  }

  const validation = validateCompleteMaintenanceForm({ resolutionNote: resolutionNoteRaw });
  if (validation.resolutionNote) {
    throw new AuthError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: validation.resolutionNote,
      details: [{ field: "resolution_note", reason: "VALIDATION_FAILED" }],
    });
  }

  let setProjectorAvailable = true;
  if ("set_projector_available" in body) {
    if (typeof body.set_projector_available !== "boolean") {
      throw new AuthError({
        status: 422,
        code: "INVALID_REQUEST",
        message: "set_projector_available harus berupa boolean.",
        details: [{ field: "set_projector_available", reason: "INVALID_TYPE" }],
      });
    }
    setProjectorAvailable = body.set_projector_available;
  }

  const staffRole = context.user.role === "ADMIN" ? "ADMIN" : "STAFF";

  return repository.completeMaintenance({
    maintenanceId: validMaintenanceId,
    resolutionNote: resolutionNoteRaw.trim(),
    setProjectorAvailable,
    staffUserId: context.user.id,
    staffRole,
    requestId,
  });
}

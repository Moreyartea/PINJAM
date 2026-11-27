import "server-only";

import type { PaginationMeta } from "@/lib/api/types";
import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { parseListQuery, parseUuidParam } from "@/lib/http/request";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProjectorRow } from "@/lib/supabase/database.types";
import type { Projector, ProjectorPhysicalStatus } from "@/types/domain";

const VALID_PHYSICAL_STATUSES = new Set<ProjectorPhysicalStatus>([
  "AVAILABLE",
  "BORROWED",
  "MAINTENANCE",
  "INACTIVE",
]);

const CREATE_ALLOWED_FIELDS = new Set(["asset_code", "name", "brand", "model"]);
const UPDATE_ALLOWED_FIELDS = new Set(["name", "brand", "model"]);
const DEACTIVATE_ALLOWED_FIELDS = new Set(["reason"]);

export interface StaffProjectorView extends Projector {
  created_at?: string;
  updated_at?: string;
  has_active_loan?: boolean;
  has_active_maintenance?: boolean;
}

export interface ProjectorRepository {
  listProjectors(params: {
    physicalStatus?: ProjectorPhysicalStatus;
    isActive?: boolean;
    page: number;
    pageSize: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }): Promise<{ items: ProjectorRow[]; totalItems: number }>;
  getProjectorById(projectorId: string): Promise<ProjectorRow | null>;
  getOperationalFlags(
    projectorId: string
  ): Promise<{ hasActiveLoan: boolean; hasActiveMaintenance: boolean }>;
  createProjector(params: {
    assetCode: string;
    name: string;
    brand: string | null;
    model: string | null;
    actorUserId: string;
    actorRole: "KOMTING" | "STAFF" | "ADMIN";
    requestId: string;
  }): Promise<ProjectorRow>;
  updateProjector(params: {
    projectorId: string;
    patch: { name?: string; brand?: string | null; model?: string | null };
    actorUserId: string;
    actorRole: "KOMTING" | "STAFF" | "ADMIN";
    requestId: string;
  }): Promise<ProjectorRow | null>;
  deactivateProjectorAtomic(params: {
    projectorId: string;
    adminUserId: string;
    reason: string | null;
    requestId: string;
  }): Promise<Projector>;
}

export interface ProjectorServiceDeps {
  repository?: ProjectorRepository;
}

function mapProjectorForRole(
  row: ProjectorRow,
  role: AuthenticatedUserContext["user"]["role"],
  flags?: { hasActiveLoan: boolean; hasActiveMaintenance: boolean }
): StaffProjectorView {
  const base: Projector = {
    id: row.id,
    asset_code: row.asset_code,
    name: row.name,
    brand: row.brand,
    model: row.model,
    physical_status: row.physical_status,
    is_active: row.is_active,
  };

  if (role === "KOMTING") {
    return base;
  }

  return {
    ...base,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(flags
      ? {
          has_active_loan: flags.hasActiveLoan,
          has_active_maintenance: flags.hasActiveMaintenance,
        }
      : {}),
  };
}

function mapProjectorDbError(error: { code?: string; message: string }): AuthError {
  const msg = error.message;

  if (msg.includes("PINJAM_ERR:PROJECTOR_NOT_FOUND")) {
    return new AuthError({
      status: 404,
      code: "PROJECTOR_NOT_FOUND",
      message: "Unit proyektor tidak ditemukan.",
    });
  }
  if (msg.includes("PINJAM_ERR:PROJECTOR_HAS_ACTIVE_LOAN")) {
    return new AuthError({
      status: 409,
      code: "PROJECTOR_HAS_ACTIVE_LOAN",
      message: "Unit proyektor tidak dapat dinonaktifkan karena masih memiliki loan aktif.",
    });
  }
  if (msg.includes("PINJAM_ERR:PROJECTOR_HAS_ACTIVE_MAINTENANCE")) {
    return new AuthError({
      status: 409,
      code: "PROJECTOR_HAS_ACTIVE_MAINTENANCE",
      message: "Unit proyektor masih memiliki catatan maintenance yang sedang berlangsung.",
    });
  }
  if (msg.includes("PINJAM_ERR:PROJECTOR_HAS_CONFIRMED_BOOKINGS")) {
    return new AuthError({
      status: 409,
      code: "PROJECTOR_HAS_CONFIRMED_BOOKINGS",
      message: "Unit proyektor masih memiliki booking aktif yang belum diselesaikan/dibatalkan.",
    });
  }
  if (msg.includes("PINJAM_ERR:PROJECTOR_ALREADY_INACTIVE")) {
    return new AuthError({
      status: 409,
      code: "PROJECTOR_ALREADY_INACTIVE",
      message: "Unit proyektor sudah berstatus nonaktif.",
    });
  }
  if (error.code === "23505" || msg.includes("uq_projectors_asset_code_lower")) {
    return new AuthError({
      status: 409,
      code: "INVALID_REQUEST",
      message: "Kode aset proyektor sudah terdaftar.",
      details: [{ field: "asset_code", reason: "ALREADY_EXISTS" }],
    });
  }

  return new AuthError({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Terjadi kesalahan internal saat memproses data proyektor.",
  });
}

export function createSupabaseProjectorRepository(): ProjectorRepository {
  const admin = createSupabaseAdminClient();

  return {
    async listProjectors({ physicalStatus, isActive, page, pageSize, sortBy, sortOrder }) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin
        .from("projectors")
        .select("*", { count: "exact" })
        .order(sortBy, { ascending: sortOrder === "asc" })
        .range(from, to);

      if (physicalStatus) {
        query = query.eq("physical_status", physicalStatus);
      }
      if (typeof isActive === "boolean") {
        query = query.eq("is_active", isActive);
      }

      const { data, count, error } = await query;
      if (error) throw mapProjectorDbError(error);

      const rows = data ?? [];
      return {
        items: rows,
        totalItems: count ?? rows.length,
      };
    },

    async getProjectorById(projectorId) {
      const { data, error } = await admin
        .from("projectors")
        .select("*")
        .eq("id", projectorId)
        .maybeSingle();

      if (error) throw mapProjectorDbError(error);
      return data;
    },

    async getOperationalFlags(projectorId) {
      const [{ data: activeLoan }, { data: activeMaint }] = await Promise.all([
        admin
          .from("loans")
          .select("id")
          .eq("projector_id", projectorId)
          .eq("status", "ACTIVE")
          .maybeSingle(),
        admin
          .from("maintenance_records")
          .select("id")
          .eq("projector_id", projectorId)
          .eq("status", "IN_PROGRESS")
          .maybeSingle(),
      ]);

      return {
        hasActiveLoan: Boolean(activeLoan),
        hasActiveMaintenance: Boolean(activeMaint),
      };
    },

    async createProjector({ assetCode, name, brand, model, actorUserId, actorRole, requestId }) {
      const { data, error } = await admin
        .from("projectors")
        .insert({
          asset_code: assetCode,
          name,
          brand,
          model,
          physical_status: "AVAILABLE",
          is_active: true,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw mapProjectorDbError(error ?? { message: "Failed to create projector" });
      }

      await admin.from("audit_logs").insert({
        actor_user_id: actorUserId,
        actor_role: actorRole,
        actor_source: "API",
        action: "PROJECTOR_CREATED",
        entity_type: "PROJECTOR",
        entity_id: data.id,
        after_data: {
          asset_code: data.asset_code,
          name: data.name,
          brand: data.brand,
          model: data.model,
          physical_status: data.physical_status,
          is_active: data.is_active,
        },
        request_id: requestId,
      });

      return data;
    },

    async updateProjector({ projectorId, patch, actorUserId, actorRole, requestId }) {
      const { data: existing, error: fetchErr } = await admin
        .from("projectors")
        .select("*")
        .eq("id", projectorId)
        .maybeSingle();

      if (fetchErr) throw mapProjectorDbError(fetchErr);
      if (!existing) return null;

      const { data: updated, error: updateErr } = await admin
        .from("projectors")
        .update(patch)
        .eq("id", projectorId)
        .select("*")
        .single();

      if (updateErr || !updated) {
        throw mapProjectorDbError(updateErr ?? { message: "Failed to update projector" });
      }

      await admin.from("audit_logs").insert({
        actor_user_id: actorUserId,
        actor_role: actorRole,
        actor_source: "API",
        action: "PROJECTOR_UPDATED",
        entity_type: "PROJECTOR",
        entity_id: updated.id,
        before_data: {
          name: existing.name,
          brand: existing.brand,
          model: existing.model,
        },
        after_data: {
          name: updated.name,
          brand: updated.brand,
          model: updated.model,
        },
        request_id: requestId,
      });

      return updated;
    },

    async deactivateProjectorAtomic({ projectorId, adminUserId, reason, requestId }) {
      const { data, error } = await admin.rpc("rpc_admin_deactivate_projector", {
        p_projector_id: projectorId,
        p_admin_user_id: adminUserId,
        p_reason: reason,
        p_request_id: requestId,
      });

      if (error) throw mapProjectorDbError(error);
      return data as unknown as Projector;
    },
  };
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

function parseNullableOptionalString(
  record: Record<string, unknown>,
  field: string
): string | null | undefined {
  if (!(field in record)) return undefined;
  const val = record[field];
  if (val === null) return null;
  if (typeof val !== "string") {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: `Field ${field} harus berupa teks atau null.`,
      details: [{ field, reason: "INVALID_TYPE" }],
    });
  }
  const trimmed = val.trim();
  return trimmed || null;
}

export async function listProjectors(
  context: AuthenticatedUserContext,
  requestUrl: string,
  deps: ProjectorServiceDeps = {}
): Promise<{ items: StaffProjectorView[]; pagination: PaginationMeta }> {
  const repository = deps.repository ?? createSupabaseProjectorRepository();
  const parsed = parseListQuery(requestUrl, {
    allowedSortBy: ["asset_code", "name", "physical_status", "created_at"],
    defaultSortBy: "asset_code",
  });

  const rawStatus = parsed.searchParams.get("physical_status")?.trim() ?? "";
  let physicalStatus: ProjectorPhysicalStatus | undefined;
  if (rawStatus) {
    if (!VALID_PHYSICAL_STATUSES.has(rawStatus as ProjectorPhysicalStatus)) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Filter physical_status tidak valid.",
        details: [{ field: "physical_status", reason: "INVALID_ENUM" }],
      });
    }
    physicalStatus = rawStatus as ProjectorPhysicalStatus;
  }

  const rawIsActive = parsed.searchParams.get("is_active")?.trim() ?? "";
  let isActive: boolean | undefined;
  if (rawIsActive) {
    if (rawIsActive === "true") {
      isActive = true;
    } else if (rawIsActive === "false") {
      isActive = false;
    } else {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Filter is_active harus bernilai true atau false.",
        details: [{ field: "is_active", reason: "INVALID_BOOLEAN" }],
      });
    }
  }

  const { items, totalItems } = await repository.listProjectors({
    physicalStatus,
    isActive,
    page: parsed.page,
    pageSize: parsed.pageSize,
    sortBy: parsed.sortBy,
    sortOrder: parsed.sortOrder,
  });

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / parsed.pageSize);
  return {
    items: items.map((row) => mapProjectorForRole(row, context.user.role)),
    pagination: {
      page: parsed.page,
      page_size: parsed.pageSize,
      total_items: totalItems,
      total_pages: totalPages,
    },
  };
}

export async function getProjectorDetail(
  context: AuthenticatedUserContext,
  projectorIdParam: string,
  deps: ProjectorServiceDeps = {}
): Promise<StaffProjectorView> {
  const projectorId = parseUuidParam(projectorIdParam, "projector_id");
  const repository = deps.repository ?? createSupabaseProjectorRepository();

  const row = await repository.getProjectorById(projectorId);
  if (!row) {
    throw new AuthError({
      status: 404,
      code: "PROJECTOR_NOT_FOUND",
      message: "Unit proyektor tidak ditemukan.",
    });
  }

  const flags =
    context.user.role === "KOMTING" ? undefined : await repository.getOperationalFlags(projectorId);

  return mapProjectorForRole(row, context.user.role, flags);
}

export async function createProjector(
  adminContext: AuthenticatedUserContext,
  rawBody: unknown,
  requestId: string,
  deps: ProjectorServiceDeps = {}
): Promise<StaffProjectorView> {
  const record = parseJsonObject(rawBody);
  const disallowed = Object.keys(record).filter((k) => !CREATE_ALLOWED_FIELDS.has(k));
  if (disallowed.length > 0) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Terdapat field yang tidak diizinkan saat membuat proyektor.",
      details: disallowed.map((field) => ({ field, reason: "FIELD_NOT_ALLOWED" })),
    });
  }

  const assetCode = typeof record.asset_code === "string" ? record.asset_code.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const missingDetails: Array<{ field: string; reason: string }> = [];
  if (!assetCode) missingDetails.push({ field: "asset_code", reason: "REQUIRED" });
  if (!name) missingDetails.push({ field: "name", reason: "REQUIRED" });

  if (missingDetails.length > 0) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Data aset proyektor belum lengkap.",
      details: missingDetails,
    });
  }

  if (assetCode.length > 64) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "asset_code maksimal 64 karakter.",
      details: [{ field: "asset_code", reason: "MAX_LENGTH_EXCEEDED" }],
    });
  }
  if (name.length > 150) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "name maksimal 150 karakter.",
      details: [{ field: "name", reason: "MAX_LENGTH_EXCEEDED" }],
    });
  }

  const brand = parseNullableOptionalString(record, "brand") ?? null;
  const model = parseNullableOptionalString(record, "model") ?? null;

  const repository = deps.repository ?? createSupabaseProjectorRepository();
  const created = await repository.createProjector({
    assetCode,
    name,
    brand,
    model,
    actorUserId: adminContext.user.id,
    actorRole: adminContext.user.role,
    requestId,
  });

  return mapProjectorForRole(created, "ADMIN");
}

export async function updateProjector(
  adminContext: AuthenticatedUserContext,
  projectorIdParam: string,
  rawBody: unknown,
  requestId: string,
  deps: ProjectorServiceDeps = {}
): Promise<StaffProjectorView> {
  const projectorId = parseUuidParam(projectorIdParam, "projector_id");
  const record = parseJsonObject(rawBody);

  const disallowed = Object.keys(record).filter((k) => !UPDATE_ALLOWED_FIELDS.has(k));
  if (disallowed.length > 0) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Terdapat field yang tidak diizinkan untuk diubah melalui pembaruan inventaris.",
      details: disallowed.map((field) => ({ field, reason: "FIELD_NOT_ALLOWED" })),
    });
  }

  const patch: { name?: string; brand?: string | null; model?: string | null } = {};
  if ("name" in record) {
    if (typeof record.name !== "string" || record.name.trim().length === 0) {
      throw new AuthError({
        status: 422,
        code: "INVALID_REQUEST",
        message: "Nama proyektor wajib diisi.",
        details: [{ field: "name", reason: "REQUIRED" }],
      });
    }
    if (record.name.trim().length > 150) {
      throw new AuthError({
        status: 422,
        code: "INVALID_REQUEST",
        message: "Nama proyektor maksimal 150 karakter.",
        details: [{ field: "name", reason: "MAX_LENGTH_EXCEEDED" }],
      });
    }
    patch.name = record.name.trim();
  }

  const brand = parseNullableOptionalString(record, "brand");
  if (brand !== undefined) patch.brand = brand;

  const model = parseNullableOptionalString(record, "model");
  if (model !== undefined) patch.model = model;

  if (Object.keys(patch).length === 0) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Minimal satu field inventaris (name, brand, model) harus disertakan.",
    });
  }

  const repository = deps.repository ?? createSupabaseProjectorRepository();
  const updated = await repository.updateProjector({
    projectorId,
    patch,
    actorUserId: adminContext.user.id,
    actorRole: adminContext.user.role,
    requestId,
  });

  if (!updated) {
    throw new AuthError({
      status: 404,
      code: "PROJECTOR_NOT_FOUND",
      message: "Unit proyektor tidak ditemukan.",
    });
  }

  return mapProjectorForRole(updated, "ADMIN");
}

export async function deactivateProjector(
  adminContext: AuthenticatedUserContext,
  projectorIdParam: string,
  rawBody: unknown,
  requestId: string,
  deps: ProjectorServiceDeps = {}
): Promise<Projector> {
  const projectorId = parseUuidParam(projectorIdParam, "projector_id");

  let reason: string | null = null;
  if (rawBody !== null && rawBody !== undefined) {
    const record = parseJsonObject(rawBody);
    const disallowed = Object.keys(record).filter((k) => !DEACTIVATE_ALLOWED_FIELDS.has(k));
    if (disallowed.length > 0) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Field body penonaktifan tidak valid.",
        details: disallowed.map((field) => ({ field, reason: "FIELD_NOT_ALLOWED" })),
      });
    }
    if ("reason" in record && record.reason !== null) {
      if (typeof record.reason !== "string") {
        throw new AuthError({
          status: 422,
          code: "INVALID_REQUEST",
          message: "Field reason harus berupa teks.",
          details: [{ field: "reason", reason: "INVALID_TYPE" }],
        });
      }
      reason = record.reason.trim() || null;
    }
  }

  const repository = deps.repository ?? createSupabaseProjectorRepository();
  return repository.deactivateProjectorAtomic({
    projectorId,
    adminUserId: adminContext.user.id,
    reason,
    requestId,
  });
}

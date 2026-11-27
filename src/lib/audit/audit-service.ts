import "server-only";

import type { PaginationMeta } from "@/lib/api/types";
import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { parseListQuery, parseUuidParam } from "@/lib/http/request";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuditLogEntry } from "@/types/domain";

export interface AuditRepository {
  listAuditLogs(params: {
    entityType?: string;
    entityId?: string;
    page: number;
    pageSize: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }): Promise<{ items: AuditLogEntry[]; totalItems: number }>;

  getAuditLogById(id: string): Promise<AuditLogEntry | null>;
}

export interface AuditServiceDeps {
  repository?: AuditRepository;
}

export function createSupabaseAuditRepository(): AuditRepository {
  const admin = createSupabaseAdminClient();

  return {
    async listAuditLogs({ entityType, entityId, page, pageSize, sortBy, sortOrder }) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin
        .from("audit_logs")
        .select(
          "id, actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, reason, request_id, created_at",
          { count: "exact" }
        );

      if (entityType && entityType !== "ALL") {
        query = query.eq("entity_type", entityType);
      }

      if (entityId) {
        query = query.eq("entity_id", entityId);
      }

      const ascending = sortOrder === "asc";
      const validSortBy = ["created_at", "action", "entity_type"].includes(sortBy)
        ? sortBy
        : "created_at";

      query = query.order(validSortBy, { ascending }).range(from, to);

      const { data, count, error } = await query;

      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }

      const items: AuditLogEntry[] = (data ?? []).map((row) => ({
        id: row.id,
        actor_user_id: row.actor_user_id ?? "",
        actor_role: row.actor_role,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        before_data: (row.before_data as Record<string, unknown> | null) ?? null,
        after_data: (row.after_data as Record<string, unknown> | null) ?? null,
        reason: row.reason,
        request_id: row.request_id,
        created_at: row.created_at,
      }));

      return {
        items,
        totalItems: count ?? items.length,
      };
    },

    async getAuditLogById(id: string) {
      const { data, error } = await admin
        .from("audit_logs")
        .select(
          "id, actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, reason, request_id, created_at"
        )
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return {
        id: data.id,
        actor_user_id: data.actor_user_id ?? "",
        actor_role: data.actor_role,
        action: data.action,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        before_data: (data.before_data as Record<string, unknown> | null) ?? null,
        after_data: (data.after_data as Record<string, unknown> | null) ?? null,
        reason: data.reason,
        request_id: data.request_id,
        created_at: data.created_at,
      };
    },
  };
}

export async function listAdminAuditLogs(
  context: AuthenticatedUserContext,
  requestUrl: string,
  deps: AuditServiceDeps = {}
): Promise<{ items: AuditLogEntry[]; pagination: PaginationMeta }> {
  if (context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya admin yang dapat melihat catatan audit log.",
    });
  }

  const parsed = parseListQuery(requestUrl, {
    allowedSortBy: ["created_at", "action", "entity_type"] as const,
    defaultSortBy: "created_at",
    defaultPageSize: 20,
    maxPageSize: 100,
  });

  const entityType = parsed.searchParams.get("entity_type")?.trim() || undefined;
  const entityId = parsed.searchParams.get("entity_id")?.trim() || undefined;

  const repo = deps.repository ?? createSupabaseAuditRepository();
  const { items, totalItems } = await repo.listAuditLogs({
    entityType,
    entityId,
    page: parsed.page,
    pageSize: parsed.pageSize,
    sortBy: parsed.sortBy,
    sortOrder: parsed.sortOrder,
  });

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / parsed.pageSize);

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

export async function getAdminAuditLogDetail(
  context: AuthenticatedUserContext,
  auditLogIdParam: string,
  deps: AuditServiceDeps = {}
): Promise<AuditLogEntry> {
  if (context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya admin yang dapat melihat detail catatan audit log.",
    });
  }

  const auditLogId = parseUuidParam(auditLogIdParam, "audit_log_id");
  const repo = deps.repository ?? createSupabaseAuditRepository();
  const item = await repo.getAuditLogById(auditLogId);

  if (!item) {
    throw new AuthError({
      status: 404,
      code: "NOT_FOUND",
      message: "Catatan audit tidak ditemukan.",
    });
  }

  return item;
}

import crypto from "node:crypto";
import { AuthError } from "@/lib/auth/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export function computeRequestHash(payload: unknown): string {
  const serialized = JSON.stringify(payload ?? null);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export interface IdempotencyStore {
  getRecord(params: {
    actorUserId: string | null;
    route: string;
    idempotencyKey: string;
  }): Promise<{ requestHash: string; responseStatus: number; responseBody: unknown } | null>;

  saveRecord(params: {
    actorUserId: string | null;
    route: string;
    idempotencyKey: string;
    requestHash: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void>;
}

export function createSupabaseIdempotencyStore(): IdempotencyStore {
  const admin = createSupabaseAdminClient();

  return {
    async getRecord({ actorUserId, route, idempotencyKey }) {
      let query = admin
        .from("idempotency_records")
        .select("request_hash, response_status, response_body, expires_at")
        .eq("route_or_operation", route)
        .eq("idempotency_key", idempotencyKey);

      if (actorUserId) {
        query = query.eq("actor_user_id", actorUserId);
      } else {
        query = query.is("actor_user_id", null);
      }

      const { data, error } = await query.maybeSingle();
      if (error || !data) return null;

      if (new Date(data.expires_at).getTime() <= Date.now()) {
        return null;
      }

      return {
        requestHash: data.request_hash,
        responseStatus: data.response_status ?? 200,
        responseBody: data.response_body,
      };
    },

    async saveRecord({
      actorUserId,
      route,
      idempotencyKey,
      requestHash,
      responseStatus,
      responseBody,
    }) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await admin.from("idempotency_records").insert({
        actor_user_id: actorUserId,
        route_or_operation: route,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        response_status: responseStatus,
        response_body: responseBody as unknown as Json,
        expires_at: expiresAt,
      });
    },
  };
}

export async function withIdempotency<T>(params: {
  actorUserId: string | null;
  route: string;
  idempotencyKey: string | null;
  requestBody: unknown;
  store?: IdempotencyStore;
  execute: () => Promise<{ status: number; body: T }>;
}): Promise<{ status: number; body: T }> {
  const { actorUserId, route, idempotencyKey, requestBody, execute } = params;

  if (!idempotencyKey || !idempotencyKey.trim()) {
    return execute();
  }

  const cleanKey = idempotencyKey.trim();
  const requestHash = computeRequestHash(requestBody);
  const store = params.store ?? createSupabaseIdempotencyStore();

  const existing = await store.getRecord({
    actorUserId,
    route,
    idempotencyKey: cleanKey,
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AuthError({
        status: 409,
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "Idempotency key telah digunakan dengan payload yang berbeda.",
      });
    }
    return {
      status: existing.responseStatus,
      body: existing.responseBody as T,
    };
  }

  const result = await execute();

  try {
    await store.saveRecord({
      actorUserId,
      route,
      idempotencyKey: cleanKey,
      requestHash,
      responseStatus: result.status,
      responseBody: result.body,
    });
  } catch (err) {
    // If unique constraint conflict happened due to concurrent request, check again
    console.error("Failed to store idempotency record", err);
  }

  return result;
}

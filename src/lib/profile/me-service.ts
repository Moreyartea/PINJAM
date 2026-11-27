import "server-only";

import { AuthError } from "@/lib/auth/errors";
import { mapPublicUserToProfile } from "@/lib/auth/sync-user";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PublicUserRow } from "@/lib/supabase/database.types";
import type { UserProfile } from "@/types/domain";

const ALLOWED_PATCH_FIELDS = new Set(["full_name"]);

export interface ProfileRepository {
  updateFullName(params: {
    userId: string;
    fullName: string;
    previousFullName: string;
    actorRole: UserProfile["role"];
    requestId: string;
  }): Promise<PublicUserRow>;
}

export function createSupabaseProfileRepository(): ProfileRepository {
  const admin = createSupabaseAdminClient();

  return {
    async updateFullName({ userId, fullName, previousFullName, actorRole, requestId }) {
      const { data, error } = await admin
        .from("users")
        .update({ full_name: fullName })
        .eq("id", userId)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`Failed to update user profile: ${error?.message ?? "unknown"}`);
      }

      await admin.from("audit_logs").insert({
        actor_user_id: userId,
        actor_role: actorRole,
        actor_source: "API",
        action: "USER_PROFILE_UPDATED",
        entity_type: "USER",
        entity_id: userId,
        before_data: { full_name: previousFullName },
        after_data: { full_name: data.full_name },
        request_id: requestId,
      });

      return data;
    },
  };
}

export function getMyProfile(context: AuthenticatedUserContext): UserProfile {
  return context.user;
}

export async function updateMyProfile(
  context: AuthenticatedUserContext,
  rawBody: unknown,
  requestId: string,
  repository: ProfileRepository = createSupabaseProfileRepository()
): Promise<UserProfile> {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Body permintaan harus berupa objek JSON yang valid.",
    });
  }

  const record = rawBody as Record<string, unknown>;
  const disallowedFields = Object.keys(record).filter((key) => !ALLOWED_PATCH_FIELDS.has(key));

  if (disallowedFields.length > 0) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Terdapat field yang tidak diizinkan untuk diubah melalui profil.",
      details: disallowedFields.map((field) => ({ field, reason: "FIELD_NOT_ALLOWED" })),
    });
  }

  if (typeof record.full_name !== "string") {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Nama lengkap wajib diisi.",
      details: [{ field: "full_name", reason: "REQUIRED" }],
    });
  }

  const trimmedName = record.full_name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Nama lengkap harus terdiri dari 2 hingga 120 karakter.",
      details: [{ field: "full_name", reason: "INVALID_LENGTH" }],
    });
  }

  const updatedRow = await repository.updateFullName({
    userId: context.user.id,
    fullName: trimmedName,
    previousFullName: context.rawUser.full_name,
    actorRole: context.user.role,
    requestId,
  });

  const mapped = mapPublicUserToProfile(updatedRow, null);
  return {
    ...mapped,
    komting_assignment: context.komtingAssignment,
  };
}

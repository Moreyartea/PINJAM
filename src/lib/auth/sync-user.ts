import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { KomtingAssignmentRow, PublicUserRow } from "@/lib/supabase/database.types";
import type { AuthSyncResult, AuthUserRepository, SupabaseAuthIdentity } from "@/lib/auth/types";
import type { KomtingAssignmentSummary, UserProfile } from "@/types/domain";

export function createSupabaseAuthUserRepository(): AuthUserRepository {
  const admin = createSupabaseAdminClient();

  return {
    async findByAuthProviderUserId(authProviderUserId: string): Promise<PublicUserRow | null> {
      const { data, error } = await admin
        .from("users")
        .select("*")
        .eq("auth_provider_user_id", authProviderUserId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to query public.users by auth_provider_user_id: ${error.message}`);
      }
      return data;
    },

    async linkUnlinkedUserByEmail(
      normalizedEmail: string,
      authProviderUserId: string
    ): Promise<PublicUserRow | null> {
      const { data: candidate, error: lookupError } = await admin
        .from("users")
        .select("*")
        .ilike("email", normalizedEmail)
        .is("auth_provider_user_id", null)
        .maybeSingle();

      if (lookupError) {
        throw new Error(`Failed to lookup unlinked user in public.users: ${lookupError.message}`);
      }
      if (!candidate) {
        return null;
      }

      const { data: linked, error: updateError } = await admin
        .from("users")
        .update({ auth_provider_user_id: authProviderUserId })
        .eq("id", candidate.id)
        .is("auth_provider_user_id", null)
        .select("*")
        .maybeSingle();

      if (updateError) {
        throw new Error(`Failed to link auth_provider_user_id: ${updateError.message}`);
      }

      return linked;
    },

    async updateEmail(userId: string, normalizedEmail: string): Promise<PublicUserRow | null> {
      const { data, error } = await admin
        .from("users")
        .update({ email: normalizedEmail })
        .eq("id", userId)
        .select("*")
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to synchronize email in public.users: ${error.message}`);
      }
      return data;
    },

    async findActiveKomtingAssignment(userId: string): Promise<KomtingAssignmentRow | null> {
      const { data, error } = await admin
        .from("komting_assignments")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load active komting assignment: ${error.message}`);
      }
      return data;
    },
  };
}

export function mapPublicUserToProfile(
  row: PublicUserRow,
  assignment: KomtingAssignmentRow | null
): UserProfile {
  const komtingAssignment: KomtingAssignmentSummary | null = assignment
    ? {
        id: assignment.id,
        user_id: assignment.user_id,
        class_name: assignment.class_name,
        status: assignment.status,
        started_at: assignment.started_at,
        ended_at: assignment.ended_at,
      }
    : null;

  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    account_status: row.account_status,
    created_at: row.created_at,
    komting_assignment: komtingAssignment,
  };
}

/**
 * Synchronizes a verified Supabase Auth identity with public.users.
 *
 * Security rules:
 * - Never auto-creates public.users rows for unknown auth.users (no unauthorized public signup).
 * - Never reads role or account_status from mutable Supabase Auth user_metadata/app_metadata.
 * - Links auth_provider_user_id ONLY if email is verified AND target row has auth_provider_user_id IS NULL.
 */
export async function syncAuthUserWithProfile(
  authUser: SupabaseAuthIdentity,
  repository: AuthUserRepository = createSupabaseAuthUserRepository()
): Promise<AuthSyncResult> {
  const existing = await repository.findByAuthProviderUserId(authUser.id);
  const normalizedAuthEmail = authUser.email?.trim().toLowerCase() ?? "";
  const isEmailVerified = Boolean(authUser.email_confirmed_at);

  if (existing) {
    if (
      isEmailVerified &&
      normalizedAuthEmail &&
      normalizedAuthEmail !== existing.email.trim().toLowerCase()
    ) {
      const updated = await repository.updateEmail(existing.id, normalizedAuthEmail);
      return { status: "SYNCED", profile: updated ?? existing };
    }
    return { status: "SYNCED", profile: existing };
  }

  if (!isEmailVerified || !normalizedAuthEmail) {
    return { status: "NOT_FOUND", profile: null };
  }

  const linked = await repository.linkUnlinkedUserByEmail(normalizedAuthEmail, authUser.id);
  if (!linked) {
    return { status: "NOT_FOUND", profile: null };
  }

  return { status: "SYNCED", profile: linked };
}

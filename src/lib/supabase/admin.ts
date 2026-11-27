import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseAdminConfig } from "@/lib/config/server-env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only privileged Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Bypasses RLS and must ONLY be used inside trusted server-side use cases
 * (e.g., auth_provider_user_id linking, atomic transactions, background jobs).
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const { url, serviceRoleKey } = getServerSupabaseAdminConfig();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

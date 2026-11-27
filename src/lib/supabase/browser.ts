import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/config/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Browser-safe Supabase client using only public NEXT_PUBLIC_* credentials.
 * Never imports server-only modules or SUPABASE_SERVICE_ROLE_KEY.
 */
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  const { url, anonKey } = getPublicSupabaseConfig();
  return createBrowserClient<Database>(url, anonKey);
}

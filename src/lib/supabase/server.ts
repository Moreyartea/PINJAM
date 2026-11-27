import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "@/lib/config/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Creates a request-scoped Supabase client bound to Next.js cookies.
 * Uses anon key + user session so PostgreSQL RLS remains enforced.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const { url, anonKey } = getPublicSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot mutate cookies during render; middleware refreshes tokens.
        }
      },
    },
  });
}

/**
 * Creates a stateless Supabase client authenticated via Authorization Bearer JWT.
 * Preserves PostgreSQL RLS under the caller's Supabase Auth identity.
 */
export function createSupabaseBearerClient(accessToken: string): SupabaseClient<Database> {
  const { url, anonKey } = getPublicSupabaseConfig();

  return createClient<Database>(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

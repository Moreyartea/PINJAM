import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client instance using client-safe public configuration.
 * Returns null if Supabase environment variables are missing (e.g. in test or unconfigured environments).
 *
 * IMPORTANT: Never use the service_role key on the client. Only NEXT_PUBLIC_SUPABASE_URL
 * and NEXT_PUBLIC_SUPABASE_ANON_KEY are allowed.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = env.supabaseUrl;
  const anonKey = env.supabaseAnonKey;

  if (!url || !anonKey) {
    return null;
  }

  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

/**
 * Injects a SupabaseClient instance (e.g. mock client for unit testing).
 * Passing null resets the singleton.
 */
export function setSupabaseClient(client: SupabaseClient | null): void {
  supabaseClient = client;
}

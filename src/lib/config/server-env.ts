import "server-only";

import { getPublicSupabaseConfig } from "@/lib/config/env";

export interface ServerSupabaseAdminConfig {
  url: string;
  serviceRoleKey: string;
}

/**
 * Server-only Supabase configuration.
 * Never import this module in Client Components or expose SUPABASE_SERVICE_ROLE_KEY.
 */
export function getServerSupabaseAdminConfig(): ServerSupabaseAdminConfig {
  const { url } = getPublicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for server-side administrative client.");
  }

  return {
    url,
    serviceRoleKey,
  };
}

/**
 * Server-only Cron secret for protected worker routes.
 */
export function getCronSecret(): string {
  return process.env.CRON_SECRET?.trim() ?? "";
}

/**
 * Server-only secret for deterministic HMAC QR token generation.
 * Isolated from SUPABASE_SERVICE_ROLE_KEY to avoid credential cross-contamination.
 */
export function getQrTokenSecret(): string {
  const customSecret = process.env.QR_TOKEN_SECRET?.trim();
  if (customSecret) return customSecret;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (adminKey) return adminKey;
  return "pinjam-internal-fallback-qr-secret-key-do-not-use-in-production";
}

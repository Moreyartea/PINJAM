/**
 * Client-safe environment configuration.
 * Never place secrets or server-side credentials in NEXT_PUBLIC_* variables.
 */

const isProduction = process.env.NODE_ENV === "production";
const rawUseMock = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

export interface PublicSupabaseConfig {
  url: string;
  anonKey: string;
}

export function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export const env = {
  appName: normalizeEnvValue(process.env.NEXT_PUBLIC_APP_NAME) || "PINJAM",
  apiBaseUrl: normalizeEnvValue(process.env.NEXT_PUBLIC_API_BASE_URL).replace(/\/+$/, ""),
  timezone: normalizeEnvValue(process.env.NEXT_PUBLIC_APP_TIMEZONE) || "Asia/Jakarta",
  supabaseUrl: normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, ""),
  supabaseAnonKey:
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  isProduction,
  // Mock mode must never be active in production (FRONTEND_SPEC_PINJAM.md §12.5).
  useMockApi: !isProduction && rawUseMock,
} as const;

/**
 * Validates and returns public Supabase configuration.
 * Reads process.env dynamically as fallback so unit tests or runtime updates are respected.
 */
export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const anonKey =
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (!isValidHttpUrl(url)) {
    throw new Error(
      "Missing or invalid NEXT_PUBLIC_SUPABASE_URL. Configure a valid HTTP/HTTPS Supabase URL."
    );
  }

  if (!anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }

  return { url, anonKey };
}

/**
 * Client-safe environment configuration.
 * Never place secrets or server-side credentials in NEXT_PUBLIC_* variables.
 */

const isProduction = process.env.NODE_ENV === "production";
const rawUseMock = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "PINJAM",
  apiBaseUrl: (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "").replace(/\/+$/, ""),
  timezone: process.env.NEXT_PUBLIC_APP_TIMEZONE?.trim() || "Asia/Jakarta",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "",
  isProduction,
  // Mock mode must never be active in production (FRONTEND_SPEC_PINJAM.md §12.5).
  useMockApi: !isProduction && rawUseMock,
} as const;

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig, isValidHttpUrl } from "@/lib/config/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Refreshes Supabase SSR auth cookies safely in Next.js middleware without
 * bypassing server-side role/account_status validation on API routes.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const rawAnon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";

  // Allow baseline static/mock pages to render if Supabase env is not yet configured.
  if (!isValidHttpUrl(rawUrl) || !rawAnon) {
    return response;
  }

  const { url, anonKey } = getPublicSupabaseConfig();
  let mutableResponse = response;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        mutableResponse = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });

        for (const { name, value, options } of cookiesToSet) {
          mutableResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Calling getUser() validates/refreshes the token with Supabase Auth server.
  await supabase.auth.getUser().catch(() => null);

  return mutableResponse;
}

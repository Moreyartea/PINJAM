import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuthSession } from "@/services/contracts";

/**
 * Browser-safe Supabase Auth adapter helpers for client session retrieval and sign-out.
 * Authorization and profile status remain enforced on the server.
 */
export async function getBrowserAuthSession(): Promise<AuthSession | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    return null;
  }

  return {
    access_token: data.session.access_token,
    expires_at:
      typeof data.session.expires_at === "number"
        ? new Date(data.session.expires_at * 1000).toISOString()
        : undefined,
  };
}

export async function signOutBrowserSession(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
}

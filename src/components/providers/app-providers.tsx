"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { getAuthProviderAdapter, registerAuthProviderAdapter } from "@/lib/auth/provider-adapter";
import { createSupabaseAuthAdapter } from "@/lib/auth/supabase-adapter";
import { env } from "@/lib/config/env";

// In real mode (not mock API), register the Supabase auth adapter eagerly if not already registered.
if (!env.useMockApi && !getAuthProviderAdapter()) {
  registerAuthProviderAdapter(createSupabaseAuthAdapter());
}

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!env.useMockApi && !getAuthProviderAdapter()) {
      registerAuthProviderAdapter(createSupabaseAuthAdapter());
    }
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}

import { setAccessTokenProvider } from "@/lib/api/client";
import type {
  AuthCredentials,
  AuthSession,
  EmailVerificationParams,
  EmailVerificationResult,
} from "@/services/contracts";

/**
 * Provider-agnostic authentication adapter interface.
 * External providers (e.g. Supabase Auth, once confirmed in Open Decisions)
 * can register an implementation without changing UI or API services.
 */
export interface AuthProviderAdapter {
  getSession(): Promise<AuthSession | null>;
  signInWithPassword(credentials: AuthCredentials): Promise<AuthSession>;
  verifyEmail(params: EmailVerificationParams): Promise<EmailVerificationResult>;
  signOut(): Promise<void>;
}

let activeAdapter: AuthProviderAdapter | null = null;
let inMemoryAccessToken: string | null = null;

/**
 * Registers the external auth provider adapter and links the API client token provider.
 */
export function registerAuthProviderAdapter(adapter: AuthProviderAdapter | null): void {
  activeAdapter = adapter;
}

export function getAuthProviderAdapter(): AuthProviderAdapter | null {
  return activeAdapter;
}

/**
 * Updates the active access token in memory and binds it to the centralized API client.
 * Never persists passwords or authoritative role claims.
 */
export function setActiveAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getActiveAccessToken(): string | null {
  return inMemoryAccessToken;
}

// Wire centralized API client once at module load.
setAccessTokenProvider(async () => {
  if (inMemoryAccessToken) {
    return inMemoryAccessToken;
  }
  if (activeAdapter) {
    const session = await activeAdapter.getSession();
    if (session?.access_token) {
      inMemoryAccessToken = session.access_token;
      return session.access_token;
    }
  }
  return null;
});

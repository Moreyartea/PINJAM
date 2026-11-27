import type { EmailOtpType, Session, SupabaseClient } from "@supabase/supabase-js";
import { ApiClientError } from "@/lib/api/errors";
import {
  type AuthProviderAdapter,
  type AuthStateChangeCallback,
  type UnsubscribeFn,
} from "@/lib/auth/provider-adapter";
import { getSupabaseClient } from "@/lib/auth/supabase-client";
import type {
  AuthCredentials,
  AuthSession,
  EmailVerificationParams,
  EmailVerificationResult,
} from "@/services/contracts";

/**
 * Maps Supabase Auth errors to standardized ApiClientError instances.
 */
export function mapSupabaseAuthError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  const errObj = error as { message?: string; status?: number; code?: string } | null;
  const msg = errObj?.message ?? "Terjadi kesalahan pada layanan autentikasi.";
  const lowerMsg = msg.toLowerCase();
  const status = typeof errObj?.status === "number" ? errObj.status : 400;

  if (status === 429 || lowerMsg.includes("too many requests") || lowerMsg.includes("rate limit")) {
    return new ApiClientError({
      status: 429,
      code: "RATE_LIMITED",
      message: "Terlalu banyak percobaan autentikasi. Silakan tunggu beberapa saat.",
    });
  }

  if (
    lowerMsg.includes("invalid login credentials") ||
    lowerMsg.includes("invalid credentials") ||
    lowerMsg.includes("invalid_grant") ||
    lowerMsg.includes("invalid email or password")
  ) {
    return new ApiClientError({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "Email atau kata sandi tidak valid.",
    });
  }

  if (lowerMsg.includes("email not confirmed") || lowerMsg.includes("email unconfirmed")) {
    return new ApiClientError({
      status: 403,
      code: "EMAIL_NOT_VERIFIED",
      message: "Email Anda belum diverifikasi. Silakan periksa inbox email Anda.",
    });
  }

  if (lowerMsg.includes("user not found") || lowerMsg.includes("user_not_found")) {
    return new ApiClientError({
      status: 404,
      code: "NOT_FOUND",
      message: "Akun pengguna tidak ditemukan di sistem.",
    });
  }

  return new ApiClientError({
    status: status >= 400 && status < 600 ? status : 400,
    code: errObj?.code || "AUTH_ERROR",
    message: msg,
  });
}

export function formatSupabaseSession(session: Session | null): AuthSession | null {
  if (!session?.access_token) return null;

  return {
    access_token: session.access_token,
    expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
  };
}

export class SupabaseAuthAdapter implements AuthProviderAdapter {
  private clientOverride?: SupabaseClient;

  constructor(clientOverride?: SupabaseClient) {
    this.clientOverride = clientOverride;
  }

  private getClient(): SupabaseClient {
    const client = this.clientOverride ?? getSupabaseClient();
    if (!client) {
      throw new ApiClientError({
        status: 500,
        code: "AUTH_PROVIDER_NOT_CONFIGURED",
        message:
          "Supabase Auth belum dikonfigurasi. Pastikan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY telah diisi.",
      });
    }
    return client;
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      const client = this.getClient();
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) {
        return null;
      }
      return formatSupabaseSession(data.session);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "AUTH_PROVIDER_NOT_CONFIGURED") {
        throw err;
      }
      return null;
    }
  }

  async signInWithPassword(credentials: AuthCredentials): Promise<AuthSession> {
    const client = this.getClient();

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        throw mapSupabaseAuthError(error);
      }

      const formatted = formatSupabaseSession(data.session);
      if (!formatted) {
        throw new ApiClientError({
          status: 401,
          code: "SESSION_NOT_CREATED",
          message: "Sesi login tidak berhasil dibuat. Pastikan email Anda sudah diverifikasi.",
        });
      }

      return formatted;
    } catch (err) {
      throw mapSupabaseAuthError(err);
    }
  }

  async verifyEmail(params: EmailVerificationParams): Promise<EmailVerificationResult> {
    const client = this.getClient();

    try {
      const tokenHash = params.token_hash || params.token;
      if (tokenHash) {
        const { error } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: (params.type as EmailOtpType) || "email",
        });
        if (error) throw mapSupabaseAuthError(error);
      } else {
        throw new ApiClientError({
          status: 400,
          code: "INVALID_VERIFICATION_TOKEN",
          message: "Token verifikasi email tidak ditemukan.",
        });
      }

      return {
        verified: true,
        message: "Email berhasil diverifikasi.",
      };
    } catch (err) {
      throw mapSupabaseAuthError(err);
    }
  }

  async signOut(): Promise<void> {
    const client = this.getClient();

    try {
      const { error } = await client.auth.signOut();
      if (error) {
        throw mapSupabaseAuthError(error);
      }
    } catch (err) {
      throw mapSupabaseAuthError(err);
    }
  }

  onAuthStateChange(callback: AuthStateChangeCallback): UnsubscribeFn {
    try {
      const client = this.getClient();
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, session) => {
        callback(event, formatSupabaseSession(session));
      });
      return () => {
        subscription.unsubscribe();
      };
    } catch {
      return () => {};
    }
  }
}

export function createSupabaseAuthAdapter(clientOverride?: SupabaseClient): SupabaseAuthAdapter {
  return new SupabaseAuthAdapter(clientOverride);
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ApiClientError } from "@/lib/api/errors";
import {
  createSupabaseAuthAdapter,
  formatSupabaseSession,
  mapSupabaseAuthError,
  SupabaseAuthAdapter,
} from "@/lib/auth/supabase-adapter";
import { getSupabaseClient, setSupabaseClient } from "@/lib/auth/supabase-client";

describe("SupabaseAuthAdapter", () => {
  let mockGetSession: ReturnType<typeof vi.fn>;
  let mockSignInWithPassword: ReturnType<typeof vi.fn>;
  let mockSignOut: ReturnType<typeof vi.fn>;
  let mockVerifyOtp: ReturnType<typeof vi.fn>;
  let mockOnAuthStateChange: ReturnType<typeof vi.fn>;
  let mockUnsubscribe: ReturnType<typeof vi.fn>;
  let mockSupabaseClient: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    setSupabaseClient(null);

    mockUnsubscribe = vi.fn();
    mockGetSession = vi.fn();
    mockSignInWithPassword = vi.fn();
    mockSignOut = vi.fn();
    mockVerifyOtp = vi.fn();
    mockOnAuthStateChange = vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });

    mockSupabaseClient = {
      auth: {
        getSession: mockGetSession,
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
        verifyOtp: mockVerifyOtp,
        onAuthStateChange: mockOnAuthStateChange,
      },
    } as unknown as SupabaseClient;
  });

  describe("getSession", () => {
    it("returns formatted AuthSession when session exists", async () => {
      mockGetSession.mockResolvedValueOnce({
        data: {
          session: {
            access_token: "jwt-test-token-123",
            expires_at: 1700000000,
          },
        },
        error: null,
      });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      const session = await adapter.getSession();

      expect(session).toEqual({
        access_token: "jwt-test-token-123",
        expires_at: new Date(1700000000 * 1000).toISOString(),
      });
      expect(mockGetSession).toHaveBeenCalledTimes(1);
    });

    it("returns null when no session is present or error occurs", async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      const session = await adapter.getSession();

      expect(session).toBeNull();
    });

    it("throws AUTH_PROVIDER_NOT_CONFIGURED when Supabase client is not available", async () => {
      const adapter = new SupabaseAuthAdapter();
      await expect(adapter.getSession()).rejects.toThrow(ApiClientError);
    });
  });

  describe("signInWithPassword", () => {
    it("returns AuthSession on successful login", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          session: {
            access_token: "valid-login-token",
            expires_at: 1700000000,
          },
        },
        error: null,
      });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      const session = await adapter.signInWithPassword({
        email: "staff@pinjam.ac.id",
        password: "securePassword123",
      });

      expect(session.access_token).toBe("valid-login-token");
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "staff@pinjam.ac.id",
        password: "securePassword123",
      });
    });

    it("maps invalid login credentials error to 401 INVALID_CREDENTIALS", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: "Invalid login credentials", status: 400 },
      });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      await expect(
        adapter.signInWithPassword({
          email: "wrong@pinjam.ac.id",
          password: "bad",
        })
      ).rejects.toMatchObject({
        status: 401,
        code: "INVALID_CREDENTIALS",
        message: "Email atau kata sandi tidak valid.",
      });
    });

    it("maps unconfirmed email error to 403 EMAIL_NOT_VERIFIED", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: "Email not confirmed", status: 400 },
      });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      await expect(
        adapter.signInWithPassword({
          email: "pending@pinjam.ac.id",
          password: "password",
        })
      ).rejects.toMatchObject({
        status: 403,
        code: "EMAIL_NOT_VERIFIED",
        message: "Email Anda belum diverifikasi. Silakan periksa inbox email Anda.",
      });
    });

    it("maps rate limiting error to 429 RATE_LIMITED", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: "Too many requests", status: 429 },
      });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      await expect(
        adapter.signInWithPassword({
          email: "spammer@pinjam.ac.id",
          password: "password",
        })
      ).rejects.toMatchObject({
        status: 429,
        code: "RATE_LIMITED",
        message: "Terlalu banyak percobaan autentikasi. Silakan tunggu beberapa saat.",
      });
    });

    it("throws 401 SESSION_NOT_CREATED when session is missing from response", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      await expect(
        adapter.signInWithPassword({
          email: "staff@pinjam.ac.id",
          password: "password",
        })
      ).rejects.toMatchObject({
        status: 401,
        code: "SESSION_NOT_CREATED",
      });
    });
  });

  describe("signOut", () => {
    it("calls client.auth.signOut successfully", async () => {
      mockSignOut.mockResolvedValueOnce({ error: null });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      await adapter.signOut();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it("throws mapped error if client signOut fails", async () => {
      mockSignOut.mockResolvedValueOnce({
        error: { message: "Network error", status: 500 },
      });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      await expect(adapter.signOut()).rejects.toThrow(ApiClientError);
    });
  });

  describe("verifyEmail", () => {
    it("calls verifyOtp with token_hash and returns success result", async () => {
      mockVerifyOtp.mockResolvedValueOnce({ error: null });

      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      const result = await adapter.verifyEmail({ token_hash: "hash-123" });

      expect(result).toEqual({
        verified: true,
        message: "Email berhasil diverifikasi.",
      });
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        token_hash: "hash-123",
        type: "email",
      });
    });

    it("throws 400 when verification token is missing", async () => {
      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      await expect(adapter.verifyEmail({})).rejects.toMatchObject({
        status: 400,
        code: "INVALID_VERIFICATION_TOKEN",
      });
    });
  });

  describe("onAuthStateChange", () => {
    it("subscribes to auth events and propagates mapped sessions", () => {
      const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
      const listenerCallback = vi.fn();

      const unsubscribe = adapter.onAuthStateChange(listenerCallback);

      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);

      // Simulate event trigger
      const registeredHandler = mockOnAuthStateChange.mock.calls[0]![0];
      registeredHandler("SIGNED_IN", {
        access_token: "new-access-token",
        expires_at: 1700000000,
      });

      expect(listenerCallback).toHaveBeenCalledWith("SIGNED_IN", {
        access_token: "new-access-token",
        expires_at: new Date(1700000000 * 1000).toISOString(),
      });

      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("formatSupabaseSession & error mapping helpers", () => {
    it("formats null session safely", () => {
      expect(formatSupabaseSession(null)).toBeNull();
      expect(formatSupabaseSession({ access_token: "" } as unknown as Session)).toBeNull();
    });

    it("handles already normalized ApiClientError", () => {
      const original = new ApiClientError({
        status: 403,
        code: "FORBIDDEN",
        message: "Akses ditolak",
      });
      expect(mapSupabaseAuthError(original)).toBe(original);
    });

    it("maps user not found errors", () => {
      const mapped = mapSupabaseAuthError({ message: "User not found" });
      expect(mapped.status).toBe(404);
      expect(mapped.code).toBe("NOT_FOUND");
    });
  });

  describe("Supabase client singleton management", () => {
    it("returns null when env vars are missing and setSupabaseClient enables testing injection", () => {
      setSupabaseClient(null);
      expect(getSupabaseClient()).toBeNull();

      setSupabaseClient(mockSupabaseClient);
      expect(getSupabaseClient()).toBe(mockSupabaseClient);

      setSupabaseClient(null);
    });
  });
});

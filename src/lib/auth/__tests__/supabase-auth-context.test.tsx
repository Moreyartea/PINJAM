import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiClientError } from "@/lib/api/errors";
import type { ApiSingleResponse } from "@/lib/api/types";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import {
  getActiveAccessToken,
  registerAuthProviderAdapter,
  setActiveAccessToken,
} from "@/lib/auth/provider-adapter";
import { createSupabaseAuthAdapter } from "@/lib/auth/supabase-adapter";
import { services } from "@/services";
import type { UserProfile } from "@/types/domain";

describe("Supabase Auth Session Lifecycle & Hardening", () => {
  let mockGetSession: ReturnType<typeof vi.fn>;
  let mockSignInWithPassword: ReturnType<typeof vi.fn>;
  let mockSignOut: ReturnType<typeof vi.fn>;
  let mockOnAuthStateChange: ReturnType<typeof vi.fn>;
  let authStateCallback: ((event: string, session: unknown) => void) | null = null;
  let mockSupabaseClient: SupabaseClient;

  const validKomtingProfile: UserProfile = {
    id: "usr_komting_123",
    email: "komting@pinjam.ac.id",
    full_name: "Budi Santoso",
    role: "KOMTING",
    account_status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  };

  const validAdminProfile: UserProfile = {
    id: "usr_admin_123",
    email: "admin@pinjam.ac.id",
    full_name: "Administrator",
    role: "ADMIN",
    account_status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    setActiveAccessToken(null);
    authStateCallback = null;

    mockGetSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSignInWithPassword = vi.fn();
    mockSignOut = vi.fn().mockResolvedValue({ error: null });
    mockOnAuthStateChange = vi.fn().mockImplementation((cb) => {
      authStateCallback = cb;
      cb("INITIAL_SESSION", null);
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });

    mockSupabaseClient = {
      auth: {
        getSession: mockGetSession,
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
        onAuthStateChange: mockOnAuthStateChange,
      },
    } as unknown as SupabaseClient;

    const adapter = createSupabaseAuthAdapter(mockSupabaseClient);
    registerAuthProviderAdapter(adapter);
  });

  it("handles initial unauthenticated state when no Supabase session exists", async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
      expect(result.current.user).toBeNull();
      expect(getActiveAccessToken()).toBeNull();
    });
  });

  it("authenticates user and extracts authoritative role from backend /api/v1/me, never from client metadata", async () => {
    vi.spyOn(services.me, "getMe").mockResolvedValueOnce({
      data: validAdminProfile,
      meta: { request_id: "req_test_1" },
    });

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-real-admin-token",
          expires_at: 1700000000,
          user: {
            id: "sb_user_1",
            user_metadata: { role: "KOMTING" },
          },
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let loggedInUser: UserProfile | undefined;
    await act(async () => {
      loggedInUser = await result.current.signIn({
        email: "admin@pinjam.ac.id",
        password: "secretPassword",
      });
    });

    expect(loggedInUser?.role).toBe("ADMIN");
    expect(result.current.user?.role).toBe("ADMIN");
    expect(result.current.status).toBe("authenticated");
    expect(getActiveAccessToken()).toBe("jwt-real-admin-token");
    expect(services.me.getMe).toHaveBeenCalledTimes(1);
  });

  it("Backend 500 tidak menghapus session Supabase", async () => {
    vi.spyOn(services.me, "getMe").mockRejectedValueOnce(
      new ApiClientError({
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
      })
    );

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-500-token",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.signIn({
          email: "staff@pinjam.ac.id",
          password: "password",
        });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({ status: 500 });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(getActiveAccessToken()).toBe("jwt-500-token");
    expect(result.current.status).toBe("error");
    expect(result.current.user).toBeNull();
  });

  it("Backend 503 tidak menghapus session Supabase", async () => {
    vi.spyOn(services.me, "getMe").mockRejectedValueOnce(
      new ApiClientError({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Layanan sedang dalam pemeliharaan.",
      })
    );

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-503-token",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.signIn({
          email: "admin@pinjam.ac.id",
          password: "password",
        });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({ status: 503 });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(getActiveAccessToken()).toBe("jwt-503-token");
    expect(result.current.status).toBe("error");
    expect(result.current.user).toBeNull();
  });

  it("Network timeout tidak menghapus session Supabase", async () => {
    vi.spyOn(services.me, "getMe").mockRejectedValueOnce(
      new ApiClientError({
        status: 504,
        code: "TIMEOUT",
        message: "Permintaan waktu habis saat menghubungi server PINJAM.",
      })
    );

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-timeout-token",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.signIn({
          email: "staff@pinjam.ac.id",
          password: "password",
        });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({ code: "TIMEOUT" });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(getActiveAccessToken()).toBe("jwt-timeout-token");
    expect(result.current.status).toBe("error");
    expect(result.current.user).toBeNull();
  });

  it("HTTP 401 membersihkan autentikasi sesuai kebijakan", async () => {
    vi.spyOn(services.me, "getMe").mockRejectedValueOnce(
      new ApiClientError({
        status: 401,
        code: "AUTH_REQUIRED",
        message: "Token tidak valid atau telah kedaluwarsa.",
      })
    );

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-expired-token",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.signIn({
          email: "staff@pinjam.ac.id",
          password: "password",
        });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({ status: 401 });
    expect(getActiveAccessToken()).toBeNull();
    expect(result.current.status).toBe("expired");
    expect(result.current.user).toBeNull();
  });

  it("Profile 404 tidak menghasilkan profil palsu", async () => {
    vi.spyOn(services.me, "getMe").mockRejectedValueOnce(
      new ApiClientError({
        status: 404,
        code: "NOT_FOUND",
        message: "Akun pengguna tidak terdaftar di database public.users PINJAM.",
      })
    );

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-unregistered-user",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.signIn({
          email: "unregistered@pinjam.ac.id",
          password: "password",
        });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({ status: 404 });
    expect(result.current.user).toBeNull();
    expect(result.current.status).toBe("unauthenticated");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("Unknown role tidak mendapat akses aplikasi", async () => {
    vi.spyOn(services.me, "getMe").mockResolvedValueOnce({
      data: {
        ...validKomtingProfile,
        role: "UNKNOWN_ROLE" as unknown as UserProfile["role"],
      },
      meta: { request_id: "req_unknown" },
    });

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-unknown-role",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.signIn({
          email: "unknown@pinjam.ac.id",
          password: "password",
        });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({
      status: 403,
      code: "UNKNOWN_ROLE",
    });

    expect(result.current.user).toBeNull();
    expect(result.current.status).toBe("unauthenticated");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("TOKEN_REFRESHED memperbarui access token", async () => {
    vi.spyOn(services.me, "getMe").mockResolvedValueOnce({
      data: validKomtingProfile,
      meta: { request_id: "req_ok" },
    });

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "initial-token-1",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await result.current.signIn({
        email: "komting@pinjam.ac.id",
        password: "password",
      });
    });

    expect(getActiveAccessToken()).toBe("initial-token-1");
    expect(result.current.user?.id).toBe("usr_komting_123");

    act(() => {
      if (authStateCallback) {
        authStateCallback("TOKEN_REFRESHED", {
          access_token: "refreshed-jwt-token-2",
          expires_at: 1700003600,
        });
      }
    });

    expect(getActiveAccessToken()).toBe("refreshed-jwt-token-2");
    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.id).toBe("usr_komting_123");
  });

  it("SIGNED_OUT membersihkan token", async () => {
    vi.spyOn(services.me, "getMe").mockResolvedValueOnce({
      data: validAdminProfile,
      meta: { request_id: "req_signout" },
    });

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "token-to-signout",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await result.current.signIn({
        email: "admin@pinjam.ac.id",
        password: "password",
      });
    });

    expect(result.current.status).toBe("authenticated");
    expect(getActiveAccessToken()).toBe("token-to-signout");

    act(() => {
      if (authStateCallback) {
        authStateCallback("SIGNED_OUT", null);
      }
    });

    expect(getActiveAccessToken()).toBeNull();
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });

  it("Session event berurutan tidak menyebabkan race condition", async () => {
    let resolveFirstMe: (val: unknown) => void;
    const firstMePromise = new Promise((resolve) => {
      resolveFirstMe = resolve;
    });

    const getMeSpy = vi
      .spyOn(services.me, "getMe")
      .mockImplementationOnce(
        () => firstMePromise as unknown as Promise<ApiSingleResponse<UserProfile>>
      )
      .mockResolvedValueOnce({
        data: validAdminProfile,
        meta: { request_id: "req_admin_fast" },
      });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    // Event 1: slow request A arrives
    act(() => {
      if (authStateCallback) {
        authStateCallback("SIGNED_IN", {
          access_token: "slow-token-A",
          expires_at: 1700000000,
        });
      }
    });

    // Wait until event A starts in-flight (getMe called once)
    await waitFor(() => {
      expect(getMeSpy).toHaveBeenCalledTimes(1);
    });

    // Event 2: newer fast request B arrives while request A is still in-flight
    act(() => {
      if (authStateCallback) {
        authStateCallback("SIGNED_IN", {
          access_token: "fast-token-B",
          expires_at: 1700000000,
        });
      }
    });

    // Fast request B completes
    await waitFor(() => {
      expect(result.current.user?.id).toBe("usr_admin_123");
    });

    // Now older slow request A resolves
    act(() => {
      resolveFirstMe!({
        data: validKomtingProfile,
        meta: { request_id: "req_komting_slow" },
      });
    });

    // Stale slow response A was ignored, user remains the newer Admin from event B
    expect(result.current.user?.id).toBe("usr_admin_123");
    expect(result.current.user?.role).toBe("ADMIN");
    expect(getActiveAccessToken()).toBe("fast-token-B");
  });

  it("Retry /api/v1/me berhasil setelah backend kembali tersedia", async () => {
    const getMeSpy = vi
      .spyOn(services.me, "getMe")
      .mockRejectedValueOnce(
        new ApiClientError({
          status: 503,
          code: "SERVICE_UNAVAILABLE",
          message: "Backend down",
        })
      )
      .mockResolvedValueOnce({
        data: validKomtingProfile,
        meta: { request_id: "req_recovered" },
      });

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-retry-token",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.signIn({
          email: "komting@pinjam.ac.id",
          password: "password",
        });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({ status: 503 });
    expect(result.current.status).toBe("error");
    expect(getActiveAccessToken()).toBe("jwt-retry-token");

    await act(async () => {
      await result.current.refreshMe();
    });

    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.id).toBe("usr_komting_123");
    expect(result.current.error).toBeNull();
    expect(getMeSpy).toHaveBeenCalledTimes(2);
  });

  it("Tidak terjadi pemanggilan /api/v1/me berulang tanpa kendali", async () => {
    const getMeSpy = vi.spyOn(services.me, "getMe").mockResolvedValue({
      data: validAdminProfile,
      meta: { request_id: "req_dup_check" },
    });

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "stable-token-123",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await result.current.signIn({
        email: "admin@pinjam.ac.id",
        password: "password",
      });
    });

    expect(getMeSpy).toHaveBeenCalledTimes(1);

    act(() => {
      if (authStateCallback) {
        authStateCallback("USER_UPDATED", {
          access_token: "stable-token-123",
          expires_at: 1700000000,
        });
        authStateCallback("INITIAL_SESSION", {
          access_token: "stable-token-123",
          expires_at: 1700000000,
        });
      }
    });

    expect(getMeSpy).toHaveBeenCalledTimes(1);
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiClientError } from "@/lib/api/errors";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import {
  getActiveAccessToken,
  registerAuthProviderAdapter,
  setActiveAccessToken,
} from "@/lib/auth/provider-adapter";
import { createSupabaseAuthAdapter } from "@/lib/auth/supabase-adapter";
import { services } from "@/services";
import type { UserProfile } from "@/types/domain";

describe("Supabase Auth & Context Integration", () => {
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
    vi.clearAllMocks();
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
      // Supabase JS v2 fires INITIAL_SESSION on subscription
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

    // Trigger initial auth callback with null session
    act(() => {
      if (authStateCallback) {
        authStateCallback("INITIAL_SESSION", null);
      }
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
            // Client metadata with a bogus role - frontend must ignore this and use /api/v1/me
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

    // Verified: Role is ADMIN from /api/v1/me, NOT KOMTING from client metadata
    expect(loggedInUser?.role).toBe("ADMIN");
    expect(result.current.user?.role).toBe("ADMIN");
    expect(result.current.status).toBe("authenticated");
    expect(getActiveAccessToken()).toBe("jwt-real-admin-token");
    expect(services.me.getMe).toHaveBeenCalledTimes(1);
  });

  it("rejects login if backend /api/v1/me returns an unknown role", async () => {
    vi.spyOn(services.me, "getMe").mockResolvedValueOnce({
      data: {
        ...validKomtingProfile,
        role: "UNKNOWN_ROLE" as unknown as UserProfile["role"],
      },
      meta: { request_id: "req_test_unknown" },
    });

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-rogue-token",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await expect(
      act(async () => {
        await result.current.signIn({
          email: "unknown@pinjam.ac.id",
          password: "password",
        });
      })
    ).rejects.toMatchObject({
      status: 403,
      code: "UNKNOWN_ROLE",
      message: "Peran pengguna tidak dikenali oleh sistem PINJAM.",
    });

    // State safely reset
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
    expect(getActiveAccessToken()).toBeNull();
  });

  it("handles user not found in backend public.users (404) safely without creating dummy accounts", async () => {
    vi.spyOn(services.me, "getMe").mockRejectedValueOnce(
      new ApiClientError({
        status: 404,
        code: "NOT_FOUND",
        message: "Akun pengguna tidak terdaftar di sistem PINJAM.",
      })
    );

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-orphan-supabase-user",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await expect(
      act(async () => {
        await result.current.signIn({
          email: "orphan@pinjam.ac.id",
          password: "password",
        });
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
    expect(getActiveAccessToken()).toBeNull();
  });

  it("handles backend unreachable (503 / 500) safely without logging user in", async () => {
    vi.spyOn(services.me, "getMe").mockRejectedValueOnce(
      new ApiClientError({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Layanan PINJAM sedang tidak dapat diakses.",
      })
    );

    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "jwt-token-503",
          expires_at: 1700000000,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await expect(
      act(async () => {
        await result.current.signIn({
          email: "staff@pinjam.ac.id",
          password: "password",
        });
      })
    ).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });

    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });

  it("updates access token in-memory on TOKEN_REFRESHED event without resetting user profile", async () => {
    vi.spyOn(services.me, "getMe").mockResolvedValueOnce({
      data: validKomtingProfile,
      meta: { request_id: "req_test_refresh" },
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

    // Supabase fires TOKEN_REFRESHED with new access token
    act(() => {
      if (authStateCallback) {
        authStateCallback("TOKEN_REFRESHED", {
          access_token: "refreshed-jwt-token-2",
          expires_at: 1700003600,
        });
      }
    });

    // In-memory token updated, profile preserved
    expect(getActiveAccessToken()).toBe("refreshed-jwt-token-2");
    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.id).toBe("usr_komting_123");
  });

  it("handles Supabase signOut cleanly and resets token and state", async () => {
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

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
    expect(getActiveAccessToken()).toBeNull();
  });
});

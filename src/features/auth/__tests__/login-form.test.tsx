import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { LoginForm } from "@/features/auth/login-form";

const replaceMock = vi.fn();
const signInMock = vi.fn();
const clearErrorMock = vi.fn();
let mockSearchNext: string | null = null;
let mockAuthState = {
  status: "unauthenticated" as "loading" | "authenticated" | "unauthenticated" | "expired",
  error: null as ApiClientError | null,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({
    get: (key: string) => (key === "next" ? mockSearchNext : null),
  }),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: mockAuthState.status,
    user: null,
    error: mockAuthState.error,
    signIn: signInMock,
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: clearErrorMock,
  }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchNext = null;
    mockAuthState = { status: "unauthenticated", error: null };
  });

  it("shows validation errors when email and password are empty", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(screen.getByText("Email wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("Password wajib diisi.")).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("validates invalid email format before submitting", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/Email/i), "not-an-email");
    await user.type(screen.getByLabelText(/Password/i), "secret123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(screen.getByText("Format email tidak valid.")).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("displays safe error state when signIn fails", async () => {
    const user = userEvent.setup();
    signInMock.mockRejectedValueOnce(
      new ApiClientError({
        status: 401,
        code: "AUTH_REQUIRED",
      })
    );

    render(<LoginForm />);
    await user.type(screen.getByLabelText(/Email/i), "user@kampus.ac.id");
    await user.type(screen.getByLabelText(/Password/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(await screen.findByText(/Login Gagal/i)).toBeInTheDocument();
    expect(screen.getByText(/Sesi login tidak valid atau telah berakhir/i)).toBeInTheDocument();
  });

  it("redirects active KOMTING to /komting after successful login", async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValueOnce({
      id: "u1",
      email: "komting@kampus.ac.id",
      full_name: "Budi",
      role: "KOMTING",
      account_status: "ACTIVE",
    });

    render(<LoginForm />);
    await user.type(screen.getByLabelText(/Email/i), "komting@kampus.ac.id");
    await user.type(screen.getByLabelText(/Password/i), "validpass");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/komting");
    });
  });

  it("redirects pending KOMTING to /application/status", async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValueOnce({
      id: "u2",
      email: "pending@kampus.ac.id",
      full_name: "Calon",
      role: "KOMTING",
      account_status: "PENDING_VERIFICATION",
    });

    render(<LoginForm />);
    await user.type(screen.getByLabelText(/Email/i), "pending@kampus.ac.id");
    await user.type(screen.getByLabelText(/Password/i), "validpass");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/application/status");
    });
  });
});

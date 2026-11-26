import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { ApplicationStatusView } from "@/features/komting/application-status-view";
import type { UserProfile } from "@/types/domain";

const getMyApplicationMock = vi.fn();
let mockAuth: {
  status: "loading" | "authenticated" | "unauthenticated" | "expired";
  user: UserProfile | null;
} = {
  status: "authenticated",
  user: {
    id: "u1",
    email: "calon@kampus.ac.id",
    full_name: "Calon Komting",
    role: "KOMTING",
    account_status: "PENDING_VERIFICATION",
  },
};

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    ...mockAuth,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshMe: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("@/services", () => ({
  isMockMode: true,
  services: {
    application: {
      getMyApplication: (...args: unknown[]) => getMyApplicationMock(...args),
    },
  },
}));

describe("ApplicationStatusView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      status: "authenticated",
      user: {
        id: "u1",
        email: "calon@kampus.ac.id",
        full_name: "Calon Komting",
        role: "KOMTING",
        account_status: "PENDING_VERIFICATION",
      },
    };
  });

  it("renders replacement notice explanation when status is PENDING_REPLACEMENT_NOTICE", async () => {
    getMyApplicationMock.mockResolvedValueOnce({
      data: {
        application_id: "app_rep_1",
        class_name: "IF-01",
        application_type: "REPLACEMENT",
        status: "PENDING_REPLACEMENT_NOTICE",
        submitted_at: "2026-11-26T07:00:00Z",
      },
      meta: { request_id: "req_1" },
    });

    render(<ApplicationStatusView />);

    expect(await screen.findByText("Proses Pergantian")).toBeInTheDocument();
    expect(screen.getAllByText("Pengajuan Pergantian Komting").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/komting lama tetap aktif sampai ADMIN memutuskan pergantian/i)
    ).toBeInTheDocument();
  });

  it("renders rejection reason when status is REJECTED", async () => {
    getMyApplicationMock.mockResolvedValueOnce({
      data: {
        application_id: "app_rej_1",
        class_name: "IF-02",
        status: "REJECTED",
        submitted_at: "2026-11-26T07:00:00Z",
        rejection_reason: "Foto KTM buram dan tidak terbaca.",
      },
      meta: { request_id: "req_2" },
    });

    render(<ApplicationStatusView />);

    expect(await screen.findByText("Pengajuan Ditolak")).toBeInTheDocument();
    expect(screen.getByText("Foto KTM buram dan tidak terbaca.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajukan Ulang" })).toBeInTheDocument();
  });

  it("renders empty state when backend returns 404", async () => {
    getMyApplicationMock.mockRejectedValueOnce(
      new ApiClientError({
        status: 404,
        code: "PROJECTOR_NOT_FOUND",
      })
    );

    render(<ApplicationStatusView />);

    expect(await screen.findByText("Belum Ada Pengajuan Komting")).toBeInTheDocument();
  });
});

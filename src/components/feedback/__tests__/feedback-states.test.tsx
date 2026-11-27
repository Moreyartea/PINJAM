import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";

describe("Feedback State Components", () => {
  it("renders LoadingState with accessible status", () => {
    render(<LoadingState title="Memuat Data..." description="Mohon tunggu." />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getAllByText("Memuat Data...").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Mohon tunggu.")).toBeInTheDocument();
  });

  it("renders EmptyState with title, description, and action", () => {
    render(
      <EmptyState
        title="Data Kosong"
        description="Belum ada item tersedia."
        action={<button type="button">Tambah</button>}
      />
    );

    expect(screen.getByText("Data Kosong")).toBeInTheDocument();
    expect(screen.getByText("Belum ada item tersedia.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah" })).toBeInTheDocument();
  });

  it("renders ErrorState with error code and triggers onRetry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <ErrorState
        title="Gagal Memuat"
        message="Terjadi kendala jaringan."
        errorCode="NETWORK_ERROR"
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Kode: NETWORK_ERROR")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Coba Lagi" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

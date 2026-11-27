import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/komting/bookings",
}));

const TEST_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/komting" },
  { label: "Daftar Booking", href: "/komting/bookings" },
  { label: "Riwayat Peminjaman", href: "/komting/loans" },
];

describe("AppShell Accessibility & Responsive Drawer", () => {
  it("renders skip-to-content link linking to #main-content", () => {
    render(
      <AppShell navItems={TEST_NAV_ITEMS}>
        <div>Halaman Konten</div>
      </AppShell>
    );

    const skipLink = screen.getByRole("link", { name: /lewati ke konten utama/i });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#main-content");
  });

  it("marks active navigation link with aria-current='page'", () => {
    render(
      <AppShell navItems={TEST_NAV_ITEMS}>
        <div>Halaman Konten</div>
      </AppShell>
    );

    const activeLinks = screen.getAllByRole("link", { name: "Daftar Booking" });
    expect(activeLinks.length).toBeGreaterThan(0);
    expect(activeLinks[0]).toHaveAttribute("aria-current", "page");

    const inactiveLinks = screen.getAllByRole("link", { name: "Riwayat Peminjaman" });
    expect(inactiveLinks[0]).not.toHaveAttribute("aria-current");
  });

  it("handles mobile menu drawer opening, keyboard Escape closure, and aria attributes", () => {
    render(
      <AppShell navItems={TEST_NAV_ITEMS} userLabel="Komting Test" roleLabel="KOMTING">
        <div>Halaman Konten</div>
      </AppShell>
    );

    const menuButton = screen.getByRole("button", { name: /buka menu navigasi/i });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveAttribute("aria-controls", "mobile-navigation-drawer");

    // Drawer should not be rendered initially
    expect(screen.queryByRole("dialog", { name: /menu navigasi/i })).not.toBeInTheDocument();

    // Open drawer
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    const dialog = screen.getByRole("dialog", { name: /menu navigasi/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("id", "mobile-navigation-drawer");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");

    // Press Escape key
    fireEvent.keyDown(window, { key: "Escape" });

    // Drawer should be closed and body overflow reset
    expect(screen.queryByRole("dialog", { name: /menu navigasi/i })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes mobile drawer when clicking the close button", () => {
    render(
      <AppShell navItems={TEST_NAV_ITEMS}>
        <div>Halaman Konten</div>
      </AppShell>
    );

    const menuButton = screen.getByRole("button", { name: /buka menu navigasi/i });
    fireEvent.click(menuButton);

    const closeButton = screen.getByRole("button", { name: /tutup menu navigasi/i });
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog", { name: /menu navigasi/i })).not.toBeInTheDocument();
  });
});

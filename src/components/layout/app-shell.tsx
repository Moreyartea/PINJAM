"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { MenuIcon, XIcon } from "@/components/ui/icons";
import { env } from "@/lib/config/env";
import { cn } from "@/lib/utils/cn";

export interface NavItem {
  label: string;
  href: string;
  badge?: string;
}

export interface AppShellProps {
  navItems: NavItem[];
  userLabel?: string;
  roleLabel?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b-2 border-[var(--border-color)]",
        className
      )}
    >
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-ink)]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function SidebarNavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-1.5">
      {items.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold rounded-[var(--radius-sm)] transition-colors",
              isActive
                ? "bg-[var(--color-primary)] nb-border nb-shadow-sm text-[var(--color-ink)]"
                : "border-2 border-transparent text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] hover:border-[var(--border-color)]"
            )}
          >
            <span>{item.label}</span>
            {item.badge && (
              <Badge tone="secondary" className="text-[10px]">
                {item.badge}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Responsive application shell with persistent desktop sidebar and accessible mobile drawer.
 */
export function AppShell({
  navItems,
  userLabel,
  roleLabel,
  headerActions,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      {/* Topbar */}
      <header className="sticky top-0 z-[var(--z-sticky)] bg-[var(--color-surface)] border-b-2 border-[var(--border-color)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {navItems.length > 0 && (
              <button
                type="button"
                aria-label="Buka menu navigasi"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 nb-border nb-shadow-sm rounded-[var(--radius-sm)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)] cursor-pointer"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            )}

            <Link
              href="/"
              className="inline-flex items-center gap-2 font-bold text-lg tracking-tight text-[var(--color-ink)]"
            >
              <span className="px-2 py-0.5 bg-[var(--color-primary)] nb-border nb-shadow-sm rounded-[var(--radius-sm)] font-mono text-sm">
                {env.appName}
              </span>
              <span className="hidden sm:inline text-sm font-semibold text-[var(--color-muted)]">
                Peminjaman Proyektor
              </span>
            </Link>

            {env.useMockApi && (
              <Badge tone="warning" symbol="!">
                DEV MOCK
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {headerActions}
            {roleLabel && <Badge tone="secondary">{roleLabel}</Badge>}
            {userLabel && (
              <span className="hidden sm:inline text-sm font-semibold text-[var(--color-ink)]">
                {userLabel}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[var(--z-drawer)] lg:hidden flex bg-black/50"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
            onClick={(e) => e.stopPropagation()}
            className="w-72 max-w-[85vw] h-full bg-[var(--color-surface)] border-r-2 border-[var(--border-color)] p-4 flex flex-col gap-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--border-color)]">
              <span className="font-bold text-base">{env.appName} Menu</span>
              <button
                type="button"
                aria-label="Tutup menu navigasi"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)] cursor-pointer"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <SidebarNavList
              items={navItems}
              pathname={pathname}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex gap-6">
        {navItems.length > 0 && (
          <aside className="hidden lg:block w-60 shrink-0">
            <div className="sticky top-22 nb-border nb-shadow rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3">
              <SidebarNavList items={navItems} pathname={pathname} />
            </div>
          </aside>
        )}

        <main id="main-content" className="flex-1 min-w-0 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}

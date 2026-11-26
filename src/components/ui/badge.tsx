import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone =
  "neutral" | "primary" | "secondary" | "success" | "warning" | "danger" | "accent";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  symbol?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[var(--color-surface-subtle)] text-[var(--color-ink)]",
  primary: "bg-[var(--color-primary)] text-[var(--color-ink)]",
  secondary: "bg-[var(--color-secondary)] text-[var(--color-ink)]",
  success: "bg-[var(--color-success)] text-[var(--color-ink)]",
  warning: "bg-[var(--color-warning)] text-[var(--color-ink)]",
  danger: "bg-[var(--color-danger)] text-[var(--color-ink)]",
  accent: "bg-[var(--color-accent)] text-[var(--color-ink)]",
};

export function Badge({ tone = "neutral", symbol, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
        "nb-border nb-shadow-sm rounded-[var(--radius-sm)] whitespace-nowrap",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {symbol && (
        <span aria-hidden="true" className="text-[11px] leading-none">
          {symbol}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}

interface StatusPresentation {
  label: string;
  tone: BadgeTone;
  symbol: string;
}

const STATUS_MAP: Record<string, StatusPresentation> = {
  // Projector physical status
  AVAILABLE: { label: "Tersedia", tone: "success", symbol: "●" },
  BORROWED: { label: "Dipinjam", tone: "warning", symbol: "▲" },
  MAINTENANCE: { label: "Maintenance", tone: "danger", symbol: "■" },
  INACTIVE: { label: "Nonaktif", tone: "neutral", symbol: "○" },

  // Booking status
  CONFIRMED: { label: "Terkonfirmasi", tone: "primary", symbol: "✓" },
  FULFILLED: { label: "Diambil", tone: "secondary", symbol: "◆" },
  CANCELLED: { label: "Dibatalkan", tone: "neutral", symbol: "✕" },
  EXPIRED: { label: "Kedaluwarsa", tone: "danger", symbol: "!" },

  // Loan & inspection status
  ACTIVE: { label: "Aktif", tone: "secondary", symbol: "●" },
  RETURNED: { label: "Dikembalikan", tone: "success", symbol: "✓" },
  NORMAL: { label: "Normal", tone: "success", symbol: "✓" },
  DAMAGED: { label: "Rusak", tone: "danger", symbol: "!" },
  COMPLETE: { label: "Lengkap", tone: "success", symbol: "✓" },
  INCOMPLETE: { label: "Tidak Lengkap", tone: "danger", symbol: "!" },

  // Application & assignment status
  PENDING_EMAIL_VERIFICATION: { label: "Verifikasi Email", tone: "warning", symbol: "…" },
  PENDING_VERIFICATION: { label: "Menunggu Verifikasi", tone: "warning", symbol: "…" },
  PENDING_REVIEW: { label: "Menunggu Review", tone: "warning", symbol: "…" },
  PENDING_REPLACEMENT_NOTICE: { label: "Proses Pergantian", tone: "accent", symbol: "⇄" },
  APPROVED: { label: "Disetujui", tone: "success", symbol: "✓" },
  REJECTED: { label: "Ditolak", tone: "danger", symbol: "✕" },
  WITHDRAWN: { label: "Ditarik", tone: "neutral", symbol: "○" },
  REPLACED: { label: "Diganti", tone: "neutral", symbol: "⇄" },

  // Maintenance status
  IN_PROGRESS: { label: "Dalam Perbaikan", tone: "warning", symbol: "■" },
  COMPLETED: { label: "Selesai", tone: "success", symbol: "✓" },
};

export interface StatusBadgeProps {
  status: string | null | undefined;
  prefix?: string;
  className?: string;
}

/**
 * Displays backend status using both color tone, symbol, and explicit text label.
 * Unrecognized statuses fall back safely to UNKNOWN (FRONTEND_SPEC_PINJAM.md §13).
 */
export function StatusBadge({ status, prefix, className }: StatusBadgeProps) {
  const normalized = (status ?? "").toUpperCase();
  const mapped = STATUS_MAP[normalized];

  if (!mapped) {
    if (process.env.NODE_ENV !== "production" && status) {
      console.warn(`[PINJAM] Unknown status value encountered: "${status}"`);
    }
    return (
      <Badge tone="neutral" symbol="?" className={className}>
        {prefix ? `${prefix}: UNKNOWN` : "UNKNOWN"}
      </Badge>
    );
  }

  return (
    <Badge tone={mapped.tone} symbol={mapped.symbol} className={className}>
      {prefix ? `${prefix}: ${mapped.label}` : mapped.label}
    </Badge>
  );
}

"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant =
  "primary" | "secondary" | "accent" | "warning" | "danger" | "outline" | "ghost";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-ink)] hover:bg-[var(--color-primary-hover)] nb-border nb-shadow nb-interactive",
  secondary:
    "bg-[var(--color-secondary)] text-[var(--color-ink)] hover:bg-[var(--color-secondary-hover)] nb-border nb-shadow nb-interactive",
  accent:
    "bg-[var(--color-accent)] text-[var(--color-ink)] hover:bg-[var(--color-accent-hover)] nb-border nb-shadow nb-interactive",
  warning:
    "bg-[var(--color-warning)] text-[var(--color-ink)] hover:brightness-95 nb-border nb-shadow nb-interactive",
  danger:
    "bg-[var(--color-danger)] text-[var(--color-ink)] hover:brightness-95 nb-border nb-shadow nb-interactive",
  outline:
    "bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] nb-border nb-shadow nb-interactive",
  ghost:
    "bg-transparent text-[var(--color-ink)] border-2 border-transparent hover:bg-[var(--color-surface-subtle)] hover:border-[var(--border-color)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-11 px-4 text-sm sm:text-base gap-2 rounded-[var(--radius-md)]",
  lg: "h-12 px-6 text-base gap-2.5 rounded-[var(--radius-md)]",
};

/**
 * Neubrutalism action button with explicit disabled/loading states to prevent double-submit.
 */
export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  loadingText,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled || isLoading);

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-semibold tracking-tight select-none cursor-pointer",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {isLoading ? (
        <LoaderIcon className="h-4 w-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0 inline-flex items-center">{leftIcon}</span>
      )}
      <span>{isLoading && loadingText ? loadingText : children}</span>
      {!isLoading && rightIcon && (
        <span className="shrink-0 inline-flex items-center">{rightIcon}</span>
      )}
    </button>
  );
}

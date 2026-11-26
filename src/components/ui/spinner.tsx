import { LoaderIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-9 w-9",
};

export function Spinner({ size = "md", label = "Memuat data...", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2", className)}
    >
      <LoaderIcon className={cn("animate-spin text-[var(--color-ink)]", sizeClasses[size])} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-[var(--color-surface-subtle)] nb-border rounded-[var(--radius-sm)]",
        className
      )}
    />
  );
}

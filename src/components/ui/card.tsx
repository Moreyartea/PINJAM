import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type CardTone =
  "default" | "subtle" | "primary" | "secondary" | "accent" | "warning" | "danger" | "success";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  interactive?: boolean;
}

const toneClasses: Record<CardTone, string> = {
  default: "bg-[var(--color-surface)]",
  subtle: "bg-[var(--color-surface-subtle)]",
  primary: "bg-[var(--color-primary)]",
  secondary: "bg-[var(--color-secondary)]",
  accent: "bg-[var(--color-accent)]",
  warning: "bg-[var(--color-warning-soft)]",
  danger: "bg-[var(--color-danger-soft)]",
  success: "bg-[var(--color-success-soft)]",
};

export function Card({
  tone = "default",
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "nb-border nb-shadow rounded-[var(--radius-md)] text-[var(--color-ink)]",
        toneClasses[tone],
        interactive && "nb-interactive",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("p-4 sm:p-5 border-b-2 border-[var(--border-color)]", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base sm:text-lg font-bold leading-snug", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-[var(--color-muted)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-4 py-3 sm:px-5 sm:py-4 border-t-2 border-[var(--border-color)] flex flex-wrap items-center gap-2",
        className
      )}
      {...props}
    />
  );
}

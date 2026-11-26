import type { HTMLAttributes, ReactNode } from "react";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
  ShieldAlertIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  title?: string;
  action?: ReactNode;
}

const toneStyles: Record<AlertTone, string> = {
  info: "bg-[var(--color-info-soft)]",
  success: "bg-[var(--color-success-soft)]",
  warning: "bg-[var(--color-warning-soft)]",
  danger: "bg-[var(--color-danger-soft)]",
};

const toneIcons: Record<AlertTone, typeof InfoIcon> = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  danger: ShieldAlertIcon,
};

export function Alert({ tone = "info", title, action, className, children, ...props }: AlertProps) {
  const Icon = toneIcons[tone];

  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn(
        "nb-border nb-shadow-sm rounded-[var(--radius-md)] p-3.5 sm:p-4 flex items-start gap-3",
        toneStyles[tone],
        className
      )}
      {...props}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5 text-[var(--color-ink)]" />
      <div className="flex-1 min-w-0 text-sm">
        {title && <p className="font-bold text-[var(--color-ink)]">{title}</p>}
        <div className={cn(title && "mt-0.5", "text-[var(--color-ink)]")}>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

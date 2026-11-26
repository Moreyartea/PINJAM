import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { InboxIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <Card tone="subtle" className={cn("w-full", className)}>
      <CardContent className="py-10 px-6 flex flex-col items-center text-center">
        <div className="h-12 w-12 rounded-[var(--radius-md)] nb-border bg-[var(--color-surface)] nb-shadow-sm flex items-center justify-center mb-4">
          {icon ?? <InboxIcon className="h-6 w-6 text-[var(--color-ink)]" />}
        </div>
        <h3 className="text-base sm:text-lg font-bold text-[var(--color-ink)]">{title}</h3>
        {description && (
          <p className="mt-1.5 text-sm text-[var(--color-muted)] max-w-md">{description}</p>
        )}
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  );
}

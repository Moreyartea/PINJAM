import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

export interface ErrorStateProps {
  title?: string;
  message: string;
  errorCode?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = "Terjadi Kendala",
  message,
  errorCode,
  onRetry,
  retryLabel = "Coba Lagi",
  action,
  className,
}: ErrorStateProps) {
  return (
    <Card tone="danger" role="alert" className={cn("w-full", className)}>
      <CardContent className="py-8 px-6 flex flex-col items-center text-center">
        <div className="h-12 w-12 rounded-[var(--radius-md)] nb-border bg-[var(--color-surface)] nb-shadow-sm flex items-center justify-center mb-4">
          <AlertTriangleIcon className="h-6 w-6 text-[var(--color-ink)]" />
        </div>
        <h3 className="text-base sm:text-lg font-bold text-[var(--color-ink)]">{title}</h3>
        <p className="mt-1.5 text-sm text-[var(--color-ink)] max-w-md">{message}</p>
        {errorCode && (
          <p className="mt-2 font-mono text-xs px-2 py-0.5 nb-border bg-[var(--color-surface)] rounded-[var(--radius-sm)]">
            Kode: {errorCode}
          </p>
        )}
        {(onRetry || action) && (
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
            {action}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

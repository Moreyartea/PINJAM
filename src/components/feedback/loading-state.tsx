import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

export interface LoadingStateProps {
  title?: string;
  description?: string;
  rows?: number;
  className?: string;
}

export function LoadingState({
  title = "Memuat data...",
  description = "Mohon tunggu sebentar.",
  rows = 3,
  className,
}: LoadingStateProps) {
  return (
    <Card className={cn("w-full", className)} aria-busy="true">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Spinner size="md" label={title} />
          <div>
            <p className="font-bold text-sm sm:text-base text-[var(--color-ink)]">{title}</p>
            {description && (
              <p className="text-xs sm:text-sm text-[var(--color-muted)]">{description}</p>
            )}
          </div>
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className={cn("h-4", index === rows - 1 ? "w-2/3" : "w-full")} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

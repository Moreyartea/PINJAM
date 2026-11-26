import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: (ariaProps: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
}

export const baseControlClasses =
  "w-full bg-[var(--color-surface)] text-[var(--color-ink)] placeholder:text-[var(--color-muted)] " +
  "nb-border rounded-[var(--radius-sm)] px-3.5 py-2.5 text-sm sm:text-base " +
  "transition-shadow focus:outline-none focus:shadow-[var(--shadow-x-sm)_var(--shadow-y-sm)_0_0_var(--shadow-color)] " +
  "disabled:bg-[var(--color-surface-subtle)] disabled:opacity-70 disabled:cursor-not-allowed";

export const errorControlClasses = "border-[var(--color-danger)] bg-[var(--color-danger-soft)]";

/**
 * Shared accessible form field wrapper linking label, hint, and error message to control.
 */
export function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  className,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-sm font-bold text-[var(--color-ink)] inline-flex items-center gap-1"
      >
        <span>{label}</span>
        {required && (
          <span aria-hidden="true" className="text-[#b91c1c]">
            *
          </span>
        )}
      </label>

      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}

      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--color-muted)]">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-[#991b1b]">
          {error}
        </p>
      )}
    </div>
  );
}

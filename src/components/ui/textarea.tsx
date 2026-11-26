import type { TextareaHTMLAttributes } from "react";
import { baseControlClasses, errorControlClasses, FormField } from "@/components/ui/form-field";
import { cn } from "@/lib/utils/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export function Textarea({
  id,
  label,
  hint,
  error,
  required,
  className,
  wrapperClassName,
  rows = 3,
  ...props
}: TextareaProps) {
  return (
    <FormField
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      {(ariaProps) => (
        <textarea
          {...ariaProps}
          required={required}
          rows={rows}
          className={cn(
            baseControlClasses,
            "min-h-[88px] resize-y",
            error && errorControlClasses,
            className
          )}
          {...props}
        />
      )}
    </FormField>
  );
}

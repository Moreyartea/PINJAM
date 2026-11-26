import type { InputHTMLAttributes } from "react";
import { baseControlClasses, errorControlClasses, FormField } from "@/components/ui/form-field";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export function Input({
  id,
  label,
  hint,
  error,
  required,
  className,
  wrapperClassName,
  ...props
}: InputProps) {
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
        <input
          {...ariaProps}
          required={required}
          className={cn(baseControlClasses, "h-11", error && errorControlClasses, className)}
          {...props}
        />
      )}
    </FormField>
  );
}

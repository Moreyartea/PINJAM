import type { SelectHTMLAttributes } from "react";
import { baseControlClasses, errorControlClasses, FormField } from "@/components/ui/form-field";
import { cn } from "@/lib/utils/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export function Select({
  id,
  label,
  options,
  placeholder,
  hint,
  error,
  required,
  className,
  wrapperClassName,
  ...props
}: SelectProps) {
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
        <select
          {...ariaProps}
          required={required}
          className={cn(baseControlClasses, "h-11", error && errorControlClasses, className)}
          {...props}
        >
          {placeholder && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}

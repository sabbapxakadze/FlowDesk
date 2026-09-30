import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./lib/cn";

/**
 * forwardRef + spread props, nothing else — this is what lets
 * {...register("field")} (React Hook Form) keep working completely
 * unchanged; the component only changes what markup gets generated.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-default)] transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)] disabled:opacity-60 aria-[invalid=true]:border-[var(--color-text-danger)]",
          className,
        )}
        {...props}
      />
    );
  },
);

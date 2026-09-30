import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "./lib/cn";

/** A plain native <select>, just styled — no Radix; nothing here needs
 * a custom-rendered listbox yet. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-default)] transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)] disabled:opacity-60 aria-[invalid=true]:border-[var(--color-text-danger)]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

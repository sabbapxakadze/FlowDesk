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
          "rounded-[var(--radius-control)] border border-[var(--color-border-input)] px-2 py-1 transition-colors focus:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

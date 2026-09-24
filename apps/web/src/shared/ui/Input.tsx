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
          "rounded-[var(--radius-control)] border border-[var(--color-border-input)] px-2 py-1",
          className,
        )}
        {...props}
      />
    );
  },
);

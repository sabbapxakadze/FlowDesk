import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./lib/cn";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "rounded-[var(--radius-control)] border border-[var(--color-border-input)] px-2 py-1 text-sm transition-colors focus:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)]",
          className,
        )}
        {...props}
      />
    );
  },
);

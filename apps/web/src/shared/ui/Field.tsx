import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * Lifted from RegisterForm's local `Field` component — the same
 * label + input + per-field-error shape was already being retyped by
 * hand in every other form, so this promotes the already-proven pattern
 * to shared/ui instead of inventing a new one.
 */
export function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      {label}
      {children}
      {error && <span className="text-[var(--color-text-danger)]">{error}</span>}
    </label>
  );
}

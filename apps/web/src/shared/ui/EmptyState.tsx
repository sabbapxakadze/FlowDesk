import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * The muted "nothing here" message shown in place of a list: one place to keep
 * that treatment consistent. The default is one inline line (charts, the bell
 * panel). `block` is for a whole list or drop zone being empty on a data
 * screen: a dashed, padded, centered box that also reads as a drop target.
 */
export function EmptyState({
  children,
  className,
  block = false,
}: {
  children: ReactNode;
  className?: string;
  block?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-[var(--color-text-muted)]",
        block &&
          "rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-input)] px-4 py-6 text-center text-sm",
        className,
      )}
    >
      {children}
    </p>
  );
}

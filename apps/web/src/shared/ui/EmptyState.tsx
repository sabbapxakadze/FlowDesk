import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/** The muted "nothing here" message shown in place of a list — one
 * place to keep that treatment consistent instead of each page
 * hand-rolling its own <p className="text-[var(--color-text-muted)]">. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[var(--color-text-muted)]", className)}>{children}</p>;
}

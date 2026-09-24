import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/** A standalone error message (a failed mutation) — distinct from
 * Field's per-input error, which is tied to one specific field. */
export function ErrorText({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm text-[var(--color-text-danger)]", className)}>{children}</p>;
}

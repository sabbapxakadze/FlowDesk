import type { HTMLAttributes } from "react";
import { cn } from "./lib/cn";

/** A plain pulsing placeholder block, sized via className (h-4 w-32,
 * etc.) — same shape as shadcn's own Skeleton. Domain-agnostic on
 * purpose: each page composes its own skeleton shape from this, rather
 * than a second "skeleton list" component trying to cover every card
 * shape in the app. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-[var(--radius-control)] bg-[var(--color-border-default)]", className)}
      {...props}
    />
  );
}

import type { HTMLAttributes } from "react";
import { cn } from "./lib/cn";

/**
 * The bordered/rounded container pattern repeated across list-item
 * cards and one-off boxes (the health-status panel, a timeline comment
 * entry). `as` picks the rendered element — "li" for real list items,
 * since a card inside a <ul> needs real list semantics, not a <div>
 * wrapped in one.
 */
export function Card({
  as: Component = "div",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "div" | "li" }) {
  return (
    <Component
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-border-default)] px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

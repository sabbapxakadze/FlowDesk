import type { HTMLAttributes } from "react";
import { cn } from "./lib/cn";

/**
 * The elevated-surface pattern repeated across list-item cards and
 * one-off boxes (the health-status panel, a timeline comment entry).
 * `as` picks the rendered element — "li" for real list items, since a
 * card inside a <ul> needs real list semantics, not a <div> wrapped in
 * one. No border at rest (Phase 3.6): a real, visible background
 * contrast against the page (bg-surface vs. bg-page) plus a soft shadow
 * is what reads as "elevated" — the Notion-inspired call, not a hard
 * outline. `hoverable` is opt-in (only the clickable cards need it).
 */
export function Card({
  as: Component = "div",
  hoverable = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "div" | "li"; hoverable?: boolean }) {
  return (
    <Component
      className={cn(
        "rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] px-4 py-3 shadow-sm transition-shadow",
        hoverable && "hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}

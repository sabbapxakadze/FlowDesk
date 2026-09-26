import { forwardRef, type ElementType, type HTMLAttributes } from "react";
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
 *
 * forwardRef (Phase 5 slice 3): dnd-kit's useSortable needs a real DOM
 * ref to attach to (setNodeRef) — same reason Input/Textarea/Select are
 * forwardRef already, for React Hook Form's register(). Existing
 * callers are unaffected; none passed a ref before.
 */
export const Card = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { as?: "div" | "li"; hoverable?: boolean }>(
  function Card({ as = "div", hoverable = false, className, ...props }, ref) {
    // Cast to a loosely-typed ElementType: TS can't reconcile one `ref`
    // value against a component type that's statically a "div" | "li"
    // union (it wants a ref valid for both simultaneously). The real
    // element is always exactly one of the two at runtime; both extend
    // HTMLElement, which is what the forwardRef generic above declares.
    const Component = as as ElementType;
    return (
      <Component
        ref={ref}
        className={cn(
          "rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] px-4 py-3 shadow-sm transition-shadow",
          hoverable && "hover:shadow-md",
          className,
        )}
        {...props}
      />
    );
  },
);

import { forwardRef, useCallback, type ElementType, type HTMLAttributes } from "react";
import { staggerStyle } from "../lib/motion";
import { cn } from "./lib/cn";
import type { RowState } from "./useAnimatedList";
import { useRowMotion } from "./useRowMotion";

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
 *
 * `rowState` / `rowIndex` (motion pass, 2026-10-04) are for cards that are rows of a list handled by
 * useAnimatedList: "initial" = rises in with a small stagger by `rowIndex`, "entering" = opens up with an
 * accent flash, "leaving" = closes up. Left out, the card does not animate.
 */
export const Card = forwardRef<
  HTMLElement,
  HTMLAttributes<HTMLElement> & { as?: "div" | "li"; hoverable?: boolean; rowState?: RowState; rowIndex?: number }
>(function Card({ as = "div", hoverable = false, rowState, rowIndex = 0, className, style, ...props }, ref) {
  const motionRef = useRowMotion<HTMLElement>(rowState === "entering" || rowState === "leaving" ? rowState : undefined);
  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      motionRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref, motionRef],
  );
  // Cast to a loosely-typed ElementType: TS can't reconcile one `ref`
  // value against a component type that's statically a "div" | "li"
  // union (it wants a ref valid for both simultaneously). The real
  // element is always exactly one of the two at runtime; both extend
  // HTMLElement, which is what the forwardRef generic above declares.
  const Component = as as ElementType;
  return (
    <Component
      ref={setRefs}
      className={cn(
        "rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] px-4 py-3 shadow-sm transition-shadow",
        hoverable && "hover:shadow-md",
        rowState === "initial" && "motion-rise-in",
        rowState === "entering" && "motion-flash",
        className,
      )}
      style={rowState === "initial" ? { ...style, ...staggerStyle(rowIndex) } : style}
      {...props}
    />
  );
});

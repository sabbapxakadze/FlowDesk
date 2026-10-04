import type { CSSProperties } from "react";

/**
 * Small helpers for the app's motion (the classes themselves, `motion-*`, live in app/index.css; the
 * rules are on the Motion section of /design-system). Domain-free.
 */

/** True when the person asked their system to reduce motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * How long to keep something on screen for its exit animation. Zero under reduced motion: the CSS turns
 * the animation off there, so waiting for it would only delay an unmount for nothing.
 */
export function exitMs(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

/**
 * The inline style that makes row `index` of a freshly loaded list start a little after the one above it
 * (a staggered entrance). Only the first 8 rows are delayed: a long list, or the rows added by "Load more",
 * must not make the last rows wait for a delay that grows with the length.
 */
export function staggerStyle(index: number): CSSProperties | undefined {
  return index < 8 ? { animationDelay: `${index * 40}ms` } : undefined;
}

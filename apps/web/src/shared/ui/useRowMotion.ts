import { useLayoutEffect, useRef } from "react";
import { exitMs, prefersReducedMotion, staggerStyle } from "../lib/motion";
import type { RowState } from "./useAnimatedList";

export type RowMotion = "entering" | "leaving";

const ENTER_MS = 220;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * Makes a list row open up when it appears and close up when it leaves (the owner's pick for rows, 2026-10-04):
 * its height, padding, opacity and the gap above/below it animate between zero and its natural size, so the
 * rows below glide instead of jumping. It uses the Web Animations API on the row element itself (no wrapper
 * element, no leftover inline styles: the animation ends where the CSS already is), and `overflow: hidden`
 * only while it runs, so the card's shadow is not clipped the rest of the time.
 *
 * Returns the ref to put on the row. `entering` plays once, when the row mounts; `leaving` plays when the row
 * is told it is leaving and keeps it collapsed (the caller removes the row shortly after, see useAnimatedList).
 * Nothing runs under "reduce motion".
 */
export function useRowMotion<T extends HTMLElement>(motion: RowMotion | undefined) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motion || prefersReducedMotion()) return;

    const style = getComputedStyle(el);
    const gap = Number.parseFloat(getComputedStyle(el.parentElement ?? el).rowGap) || 0;
    const natural = {
      height: `${el.getBoundingClientRect().height}px`,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      marginBottom: style.marginBottom,
      opacity: 1,
    };
    const collapsed = { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginBottom: `${-gap}px`, opacity: 0 };

    el.style.overflow = "hidden";
    const animation = el.animate(motion === "entering" ? [collapsed, natural] : [natural, collapsed], {
      duration: motion === "entering" ? ENTER_MS : exitMs(ENTER_MS),
      easing: EASE,
      fill: motion === "leaving" ? "forwards" : "none",
    });
    animation.onfinish = () => {
      if (motion === "entering") el.style.overflow = "";
    };
    return () => {
      animation.cancel();
      el.style.overflow = "";
    };
  }, [motion]);

  return ref;
}

/**
 * For a row that is a plain element (not a Card): the ref, class and style that give it the same motion as a
 * Card with `rowState` (see Card). `initial` rises in with a stagger by `index`, `entering` opens up and
 * flashes, `leaving` closes up, anything else does nothing.
 */
export function useRowMotionProps<T extends HTMLElement>(state?: RowState, index = 0) {
  const ref = useRowMotion<T>(state === "entering" || state === "leaving" ? state : undefined);
  return {
    ref,
    className: state === "initial" ? "motion-rise-in" : state === "entering" ? "motion-flash" : "",
    style: state === "initial" ? staggerStyle(index) : undefined,
  };
}

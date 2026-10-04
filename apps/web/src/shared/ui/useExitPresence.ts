import { useEffect, useState } from "react";
import { exitMs } from "../lib/motion";

/**
 * Lets something that appears and disappears (the side panel, a dropdown) play an exit animation: it
 * stays `rendered` for `ms` after `open` turns false, with `closing` true meanwhile, then is gone. Under
 * "reduce motion" the wait is zero (the CSS has no animation to wait for).
 *
 * `open` going true again during the exit simply cancels it. Nothing here delays the ACTION: whatever
 * closed it (state, focus, listeners) has already happened; only the unmount is late. The "rendered" flag
 * is raised while rendering (React's adjust-state-when-a-prop-changes pattern), so the only state change
 * inside an effect is the timer's own.
 */
export function useExitPresence(open: boolean, ms: number): { rendered: boolean; closing: boolean } {
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);

  useEffect(() => {
    if (open || !rendered) return;
    const timer = window.setTimeout(() => setRendered(false), exitMs(ms));
    return () => window.clearTimeout(timer);
  }, [open, rendered, ms]);

  return { rendered: open || rendered, closing: rendered && !open };
}

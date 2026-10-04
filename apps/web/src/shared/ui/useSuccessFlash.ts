import { useEffect, useState } from "react";

/**
 * True for `ms` after `isSuccess` turns true, then false again: the "just saved" tick on a Save button
 * (Button's `done` prop). Not shown on first render (when already true), and it resets when the success
 * flag drops. The flag is derived while rendering (React's "adjust state when a prop changes" pattern), so
 * the only state change inside an effect is the timer's own.
 */
export function useSuccessFlash(isSuccess: boolean, ms = 1200): boolean {
  const [previous, setPrevious] = useState(isSuccess);
  const [flash, setFlash] = useState(false);
  if (isSuccess !== previous) {
    setPrevious(isSuccess);
    setFlash(isSuccess);
  }
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(false), ms);
    return () => window.clearTimeout(timer);
  }, [flash, ms]);
  return isSuccess && flash;
}

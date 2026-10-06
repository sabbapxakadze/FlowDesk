import { useCallback, useEffect, useRef, useState } from "react";
import { LAST_ACTIVITY_KEY } from "./idle-config";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

function readStoredActivity(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null; // storage can be blocked (private window, site settings): this tab then counts on its own
  }
}

function storeActivity(at: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // see readStoredActivity
  }
}

/**
 * Tells when the person has been inactive: `secondsLeft` is null while all is well, and counts down from `warnMs` once they
 * have done nothing for `idleMs`; at zero `onTimeout` runs once. "Doing something" is the person's own input on the page
 * (pressing, typing, touching, moving, scrolling), not background traffic.
 *
 * - Everything is computed from timestamps, never from counting ticks, so a throttled background tab or a laptop that slept
 *   still gets the right answer when the next check runs (every second, and again as soon as the tab is visible).
 * - The time of the last activity is shared between tabs of the browser through localStorage, so working in one tab keeps the
 *   others from warning.
 * - While the warning is showing, ordinary movement does not dismiss it (a brushed mouse must not silently extend a session
 *   the person has walked away from); `keepAlive` does, and is what the dialog's button calls.
 *
 * Domain-free: it knows nothing about login; the caller decides what a timeout means.
 */
export function useIdleTimeout({
  enabled,
  idleMs,
  warnMs,
  onTimeout,
}: {
  enabled: boolean;
  idleMs: number;
  warnMs: number;
  onTimeout: () => void;
}): { secondsLeft: number | null; keepAlive: () => void } {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const lastWritten = useRef(0);
  const warning = useRef(false);
  const timedOut = useRef(false);
  const latestOnTimeout = useRef(onTimeout);
  useEffect(() => {
    latestOnTimeout.current = onTimeout;
  });

  const touch = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    if (now - lastWritten.current >= 1000) {
      lastWritten.current = now;
      storeActivity(now);
    }
  }, []);

  const keepAlive = useCallback(() => {
    warning.current = false;
    touch();
    setSecondsLeft(null);
  }, [touch]);

  useEffect(() => {
    if (!enabled) return;
    timedOut.current = false;
    // A page that has just loaded counts as activity (a reload is the person being here).
    warning.current = false;
    lastActivity.current = Date.now();
    lastWritten.current = 0;
    touch();

    function onInput() {
      if (!warning.current) touch();
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== LAST_ACTIVITY_KEY) return;
      const at = Number(event.newValue);
      if (Number.isFinite(at) && at > lastActivity.current) {
        lastActivity.current = at;
        if (warning.current && Date.now() - at < idleMs) {
          warning.current = false;
          setSecondsLeft(null);
        }
      }
    }
    function check() {
      if (timedOut.current) return;
      // Another tab may have been active while this one's timers were asleep.
      const stored = readStoredActivity();
      if (stored && stored > lastActivity.current) lastActivity.current = stored;
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= idleMs + warnMs) {
        timedOut.current = true;
        warning.current = false;
        setSecondsLeft(null);
        latestOnTimeout.current();
      } else if (idleFor >= idleMs) {
        warning.current = true;
        setSecondsLeft(Math.max(1, Math.ceil((idleMs + warnMs - idleFor) / 1000)));
      } else if (warning.current) {
        warning.current = false;
        setSecondsLeft(null);
      }
    }

    for (const name of ACTIVITY_EVENTS)
      window.addEventListener(name, onInput, { capture: true, passive: true });
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 1000);
    return () => {
      for (const name of ACTIVITY_EVENTS)
        window.removeEventListener(name, onInput, { capture: true });
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [enabled, idleMs, warnMs, touch]);

  return { secondsLeft, keepAlive };
}

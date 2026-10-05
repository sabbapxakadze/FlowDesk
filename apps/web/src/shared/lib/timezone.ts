import { useSyncExternalStore } from "react";

/**
 * The signed-in person's own timezone (an IANA name such as "Europe/Warsaw"), or null for "use the browser's". A tiny
 * module-level store, like the theme: the auth context sets it when a session starts or ends, the account page sets it
 * when it is changed, and anything that formats an absolute time reads it (`useTimezone`). It is not secret and not a
 * credential, so it lives outside React state.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

export function setTimezone(timezone: string | null): void {
  if (timezone === current) return;
  current = timezone;
  listeners.forEach((listener) => listener());
}

export function useTimezone(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

/** The browser's own zone, for the "Browser setting" choice. */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

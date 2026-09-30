import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribe, type Theme } from "./theme-store";

/** The current theme preference and a setter. Same external-store pattern as
 * useIsDesktop in app/AppShell.tsx. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system" as Theme);
  return [theme, setTheme];
}

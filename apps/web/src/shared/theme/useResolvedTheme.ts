import { useSyncExternalStore } from "react";
import { useTheme } from "./useTheme";

const QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystem(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * What the page actually looks like right now: "light" or "dark". The saved choice when it is Light or Dark; for "System" the
 * operating system's setting, followed live. For things that must match the theme but cannot be done with tokens alone, such as
 * choosing between a light and a dark screenshot.
 */
export function useResolvedTheme(): "light" | "dark" {
  const [theme] = useTheme();
  const systemIsDark = useSyncExternalStore(
    subscribeToSystem,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  if (theme === "system") return systemIsDark ? "dark" : "light";
  return theme;
}

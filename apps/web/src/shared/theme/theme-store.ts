/**
 * The theme preference: "light", "dark", or "system" (follow the OS). A module
 * level store so any component can read it and every open tab stays in step.
 *
 * It works by setting `data-theme` on <html>, which semantic.css already
 * honours; "system" means no attribute. The choice is saved in localStorage
 * under KEY ("system" = key removed). That is fine for a preference: ADR 0003
 * keeps tokens out of localStorage, not settings. Every storage call is in
 * try/catch, because storage can be blocked (private windows, disabled site
 * data); then the theme still changes for this tab, it just is not remembered.
 *
 * index.html has a tiny inline script that applies the saved value before the
 * first paint (React mounts after it, which would flash the wrong colours). It
 * reads the same key, so if KEY changes, change it there too.
 */
import { prefersReducedMotion } from "../lib/motion";

export type Theme = "system" | "light" | "dark";

const KEY = "flowdesk-theme";
const listeners = new Set<() => void>();

function readSaved(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyToDocument(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

let current: Theme = typeof window === "undefined" ? "system" : readSaved();
if (typeof window !== "undefined") {
  applyToDocument(current);
  // Another tab changed the preference (or cleared storage).
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      current = readSaved();
      applyToDocument(current);
      notify();
    }
  });
}

export function getTheme(): Theme {
  return current;
}

/**
 * The colours blend for a moment (the `motion-theme-fade` class on <html>, app/index.css) instead of the
 * whole page flipping in one frame. Only for a change the person makes here; the first paint and another
 * tab's change are applied as they are. Skipped under "reduce motion".
 */
function fadeThemeChange(): void {
  if (prefersReducedMotion()) return;
  const root = document.documentElement;
  root.classList.add("motion-theme-fade");
  window.setTimeout(() => root.classList.remove("motion-theme-fade"), 260);
}

export function setTheme(theme: Theme): void {
  current = theme;
  fadeThemeChange();
  applyToDocument(theme);
  try {
    if (theme === "system") {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, theme);
    }
  } catch {
    // Not remembered, still applied to this tab.
  }
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

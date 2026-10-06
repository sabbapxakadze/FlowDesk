import { useSyncExternalStore } from "react";

/**
 * The state of a guided tour (ADR 0040), kept outside React so a button anywhere can start it and one overlay, mounted once, shows it.
 * Domain-free: a step is text, optionally a `target` (the value of a `data-tour="..."` attribute on the page) and optionally a `path` to
 * be on first. Which steps there are, and what they say, is the caller's business (features/app-tour).
 */
export type TourPlacement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** The `data-tour` name of the element to highlight. No target means a centered card (a welcome, a goodbye). */
  target?: string;
  /** Go here first (a path such as `/projects/WEB/board`). */
  path?: string;
  /** Which side of the target the card prefers; another side is used when there is no room. */
  placement?: TourPlacement;
}

export interface TourState {
  steps: TourStep[];
  index: number;
  /** Which way the person was going, so a step that cannot be shown is skipped the same way. */
  direction: 1 | -1;
}

let state: TourState | null = null;
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function startTour(steps: TourStep[]): void {
  if (steps.length === 0) return;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state = { steps, index: 0, direction: 1 };
  emit();
}

export function goToStep(index: number, direction: 1 | -1): void {
  if (!state) return;
  if (index >= state.steps.length) {
    closeTour();
    return;
  }
  state = { ...state, index: Math.max(0, index), direction };
  emit();
}

export function closeTour(): void {
  if (!state) return;
  state = null;
  emit();
  // Back to whatever had focus when the tour began (the Tutorial button), so a keyboard user is not dropped at the top of the page.
  const back = opener;
  opener = null;
  window.setTimeout(() => back?.focus(), 0);
}

export function useTour(): TourState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Whether something can be seen: it has a size and is not parked off to the side (a closed drawer). */
function isShown(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth
  );
}

/**
 * Resolves with the element carrying `data-tour="<name>"` once it exists and is shown, or null after `timeoutMs`. A page that has
 * just been navigated to needs a moment (its data loads), so this waits instead of looking once.
 */
export function waitForTarget(
  name: string,
  timeoutMs = 3000,
): Promise<HTMLElement | null> {
  const selector = `[data-tour="${name}"]`;
  const find = () => {
    const element = document.querySelector<HTMLElement>(selector);
    return element && isShown(element) ? element : null;
  };
  return new Promise((resolve) => {
    const now = find();
    if (now) return resolve(now);
    const finish = (element: HTMLElement | null) => {
      observer.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
      resolve(element);
    };
    const check = () => {
      const found = find();
      if (found) finish(found);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = window.setInterval(check, 150);
    const giveUp = window.setTimeout(() => finish(null), timeoutMs);
  });
}

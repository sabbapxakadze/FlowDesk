import { useEffect, useRef, type MouseEvent } from "react";

/**
 * Lets the whole card be dragged while the title link still works as a link.
 *
 * A plain click (pointer moves less than the sensor's activation distance)
 * never starts a drag, so it navigates as usual. After a REAL drag, though, the
 * browser still fires a click when the button is released, and it can land on
 * the title <Link> and navigate away mid-drop. This returns an onClick for that
 * Link that cancels the click while the card is being dragged and for a short
 * window after (a ref cleared by a timeout that outlasts the click event, which
 * is dispatched synchronously right after pointer-up).
 */
export function useDragClickGuard(isDragging: boolean) {
  const blockRef = useRef(false);

  useEffect(() => {
    if (isDragging) {
      blockRef.current = true;
      return;
    }
    if (!blockRef.current) return;
    const timeout = setTimeout(() => {
      blockRef.current = false;
    }, 150);
    return () => clearTimeout(timeout);
  }, [isDragging]);

  return (event: MouseEvent) => {
    if (blockRef.current) event.preventDefault();
  };
}

/**
 * dnd-kit's `listeners` include a keyboard handler (Space/Enter starts a
 * drag). On the whole card that would start a drag when Enter is pressed on the
 * focused title link, so the card wrapper only gets the pointer handlers; the
 * grip button keeps the full set, which is what keyboard dragging uses.
 */
export function pointerListeners(listeners: Record<string, unknown> | undefined) {
  if (!listeners) return {};
  return Object.fromEntries(Object.entries(listeners).filter(([name]) => name !== "onKeyDown"));
}

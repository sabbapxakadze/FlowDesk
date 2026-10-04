import { useEffect, useRef, type ReactNode } from "react";

/**
 * A floating panel at the right edge (a full-screen sheet on a phone): a card with a margin
 * around it that does NOT dim or block the page, so the page behind stays usable. The
 * caller decides what is inside; this only knows how to behave like a panel:
 *
 * - Esc closes it (unless a native <dialog> is open on top of it: that dialog gets the
 *   Esc first, so closing an image preview does not also close the panel).
 * - A click anywhere outside closes it, except a click a link already handled (its router
 *   handler called preventDefault and is navigating: closing too would send the page back to
 *   where it was; the panel goes away by itself when the page changes), on an element marked `data-panel-trigger`
 *   (the cards that open or swap it, and controls that work on the page behind it, like the issue
 *   list's filters) and inside any open <dialog> (the command palette,
 *   an image preview). The click is not swallowed: if it landed on a button, that button
 *   still acts, and the panel closes after it. It listens for `click`, not `pointerdown`, on
 *   purpose: the button's own handler may change the URL (a filter), and closing first would
 *   make the two URL updates race. Inside/outside is decided from the event's original path
 *   (`composedPath`), because the clicked element may already have removed itself from the
 *   page by the time this runs (a Cancel button, say). Pressing the page's own scrollbar does
 *   not count as outside.
 * - Focus moves into the panel when it opens and returns to whatever opened it on close.
 *
 * It is non-modal on purpose (aria-modal is false, nothing behind is made inert).
 *
 * Motion (owner's design pass, 2026-10-04): it slides in from the right while fading. The page behind is left
 * exactly as it is: no dimming (the owner tried "slide and dim" and wanted nothing to change behind the panel,
 * which is the whole point of it being non-modal). `closing` is true
 * while the exit animation plays (the caller keeps the panel mounted for that long, see useExitPresence):
 * the panel is `inert`, its listeners are off and focus has ALREADY gone back to what opened it, because
 * closing is never delayed, only the unmount.
 */
export function SidePanel({
  label,
  onClose,
  closing = false,
  children,
}: {
  label: string;
  onClose: () => void;
  closing?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  // The latest onClose without re-running the effect (a new function every render must not
  // re-attach listeners or steal focus again).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    // Closing: nothing to set up, and the previous run's cleanup has just restored the focus.
    if (closing) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus({ preventScroll: true });

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target === document.documentElement) return; // the page scrollbar
      if (event.defaultPrevented) return; // a link is already navigating
      const path = event.composedPath();
      if (ref.current && path.includes(ref.current)) return;
      const ignored = path.some(
        (node) => node instanceof Element && (node.hasAttribute("data-panel-trigger") || node.tagName === "DIALOG"),
      );
      if (ignored) return;
      onCloseRef.current();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      onCloseRef.current();
    }

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, [closing]);

  return (
    <>
      <section
        ref={ref}
        role="dialog"
        aria-modal="false"
        aria-label={label}
        tabIndex={-1}
        inert={closing}
        className={`fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--color-bg-surface)] text-[var(--color-text-default)] shadow-xl focus:outline-none sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[480px] sm:rounded-[var(--radius-card)] sm:border sm:border-[var(--color-border-default)] ${
          closing ? "motion-slide-out-right" : "motion-slide-in-right"
        }`}
      >
        {children}
      </section>
    </>
  );
}

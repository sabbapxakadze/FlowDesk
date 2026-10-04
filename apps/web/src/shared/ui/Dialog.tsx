import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { cn } from "./lib/cn";

/**
 * A modal dialog with a title and a close button: a native <dialog> opened with showModal(), the same
 * choice as the search popup and the image preview (no dialog library for a handful of modals). That gives,
 * for free: it sits in the top layer above everything (a side panel included), the page behind is inert, Esc
 * closes it (and only it: the side panel leaves Esc to an open dialog), and focus stays inside. It fades and
 * grows in (`motion-dialog`, ADR 0029).
 *
 * Mount it only while it should be open; it opens itself on mount and calls `onClose` when it closes (Esc,
 * the X, a click on the dimmed area). On unmount, focus goes back to whatever opened it. The first element
 * marked `data-autofocus` gets focus when it opens, so a form starts in its first field.
 *
 * `dismissOnBackdrop={false}` ignores a click on the dimmed area (a form with unsaved text, where a stray
 * click must not throw the work away); Esc and the X still close it.
 *
 * Domain-free: it only knows a title and children.
 */
export function Dialog({
  title,
  onClose,
  dismissOnBackdrop = true,
  className,
  children,
}: {
  title: string;
  onClose: () => void;
  dismissOnBackdrop?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // What had focus when the dialog opened. Kept in a ref: in development React runs the effect twice, and by the
  // second run focus is already inside the dialog, so the opener must be captured once.
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!openerRef.current && document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
    const opener = openerRef.current;
    // Guarded: React runs effects twice in development.
    if (!dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    return () => {
      // Only a real unmount (the element is gone), not development's extra effect run.
      setTimeout(() => {
        if (!dialog.isConnected) opener?.focus();
      }, 0);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // The dimmed area belongs to the <dialog> itself, so a click on it has the dialog as its target.
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-full max-w-xl rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-0 text-[var(--color-text-default)] shadow-lg motion-dialog [--dialog-backdrop:rgb(0_0_0/0.4)]",
        className,
      )}
    >
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl [overflow-wrap:anywhere]">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}

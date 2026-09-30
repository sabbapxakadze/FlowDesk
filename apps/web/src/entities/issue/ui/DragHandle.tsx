import { GripVertical } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

/**
 * The grip button on draggable cards. It only supplies the look; the caller
 * spreads dnd-kit's `attributes` and `listeners` (and the aria-label) onto it,
 * exactly as before. `touch-none` stops the browser from scrolling the page
 * when a finger starts a drag on it.
 */
export function DragHandle(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="mt-0.5 cursor-grab touch-none rounded-[var(--radius-control)] p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-default)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)] active:cursor-grabbing"
    >
      <GripVertical size={16} aria-hidden="true" />
    </button>
  );
}

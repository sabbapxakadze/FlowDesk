import { GripVertical } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

/**
 * The grip button on draggable cards. It only supplies the look; the caller
 * spreads dnd-kit's `attributes` and `listeners` (and the aria-label) onto it,
 * exactly as before. `touch-none` stops the browser from scrolling the page
 * when a finger starts a drag on it. It shows on hover and on keyboard focus (the card is a `group`), and always on a touch
 * screen; it sits over the card's left padding (the card is `relative`), so it takes no room when hidden and nothing shifts when it shows. Dragging works from anywhere on the card, so the grip is mostly a hint.
 */
export function DragHandle(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="absolute top-2.5 left-1.5 z-10 cursor-grab touch-none rounded-[var(--radius-control)] p-1 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-[var(--color-text-default)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)] active:cursor-grabbing"
    >
      <GripVertical size={16} aria-hidden="true" />
    </button>
  );
}

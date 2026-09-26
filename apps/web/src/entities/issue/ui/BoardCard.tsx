import { Link } from "react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Issue } from "@flowdesk/contracts";
import { Card } from "../../../shared/ui";

/**
 * Draggable via useSortable — replaces slice 2's up/down/move-to
 * buttons entirely (see the Phase 5 slice 3 plan's "Decisions").
 * useSortable's own keyboard coordinate getter is what makes this
 * genuinely keyboard-operable (Tab, Space, arrow keys, Space), not just
 * pointer-draggable — the reason this slice uses @dnd-kit/sortable
 * instead of the lighter-weight @dnd-kit/core alone.
 *
 * A dedicated drag handle, not the whole card: an earlier version put
 * attributes/listeners on the card itself (including the title Link),
 * on the theory that a PointerSensor activation *distance* would
 * disambiguate a click from a drag. It didn't — verified live: dragging
 * the card genuinely navigated to the issue detail page mid-drop,
 * because dnd-kit's synthetic click after a completed drag still fires
 * on whatever element received the original pointerdown, and checking
 * `isDragging` in the Link's onClick doesn't help since that flag has
 * already reset to false by the time the click event fires. A separate
 * handle sidesteps the ambiguity entirely instead of trying to
 * out-guess it.
 */
export function BoardCard({ issue, projectKey }: { issue: Issue; projectKey: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
  });

  return (
    <Card
      as="li"
      ref={setNodeRef}
      hoverable
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        aria-label="Drag to reorder or move"
        className="cursor-grab text-[var(--color-text-muted)] active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <Link to={`/projects/${issue.projectId}/issues/${issue.id}`} className="block flex-1">
        <p className="text-sm text-[var(--color-text-muted)]">
          {projectKey}-{issue.number}
        </p>
        <p className="font-medium">{issue.title}</p>
      </Link>
    </Card>
  );
}

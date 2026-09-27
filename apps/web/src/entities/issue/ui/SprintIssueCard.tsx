import { Link } from "react-router";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Issue } from "@flowdesk/contracts";
import { Card } from "../../../shared/ui";

/**
 * Draggable via useDraggable (@dnd-kit/core), not BoardCard's
 * useSortable — this page only needs membership in one of two
 * containers (backlog / active sprint), not insert-before-this-card
 * ordering, so the lighter primitive is enough. See the Phase 5 slice 4
 * plan's "Decisions".
 *
 * Same dedicated-drag-handle fix as BoardCard: the whole card can't be
 * the drag source, or a completed drag's synthetic click re-fires on
 * the title Link and navigates away instead of landing the drop.
 */
export function SprintIssueCard({ issue, projectKey }: { issue: Issue; projectKey: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: issue.id });

  return (
    <Card
      as="li"
      ref={setNodeRef}
      hoverable
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`flex items-start gap-2 ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        aria-label="Drag to move between backlog and sprint"
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

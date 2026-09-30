import { Link } from "react-router";
import { useDraggable } from "@dnd-kit/core";
import type { Issue } from "@flowdesk/contracts";
import { Card } from "../../../shared/ui";
import { pointerListeners, useDragClickGuard } from "../lib/dragHelpers";
import { DragHandle } from "./DragHandle";
import { IssueSummary } from "./IssueSummary";

/**
 * Draggable via useDraggable (@dnd-kit/core), not BoardCard's useSortable: this
 * page only needs membership in one of two containers (backlog / active
 * sprint), not insert-before-this-card ordering, so the lighter primitive is
 * enough. See the Phase 5 slice 4 plan's "Decisions".
 *
 * Same interaction as BoardCard: drag from anywhere on the card, the grip keeps
 * the keyboard listeners, and the title link is protected from the click that
 * follows a drag. The card itself does not follow the pointer; the page's
 * DragOverlay does, which also means it can never be clipped by a scroll
 * container.
 */
export function SprintIssueCard({ issue, projectKey }: { issue: Issue; projectKey: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id });
  const guardClick = useDragClickGuard(isDragging);

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? "opacity-40" : ""}
      {...pointerListeners(listeners)}
    >
      <Card hoverable className="flex items-start gap-2 select-none">
        <DragHandle aria-label="Drag to move between backlog and sprint" {...attributes} {...listeners} />
        <Link
          to={`/projects/${issue.projectId}/issues/${issue.id}`}
          draggable={false}
          onClick={guardClick}
          className="block min-w-0 flex-1"
        >
          <IssueSummary issue={issue} projectKey={projectKey} />
        </Link>
      </Card>
    </li>
  );
}

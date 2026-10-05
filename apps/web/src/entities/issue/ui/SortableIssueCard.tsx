import type { ReactNode } from "react";
import { Link } from "react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Issue } from "@flowdesk/contracts";
import { issueKey, issuePath } from "../../../shared/lib/paths";
import { Card } from "../../../shared/ui";
import { pointerListeners, useDragClickGuard } from "../lib/dragHelpers";
import { openIssueOnClick } from "../lib/issueLinkClick";
import { DragHandle } from "./DragHandle";
import { IssueSummary } from "./IssueSummary";

/**
 * An issue card that is sortable inside a list (the board's columns, the sprints page's backlog and
 * active sprint; renamed from BoardCard when the sprints page got the same ordering), draggable from
 * anywhere on the card via useSortable, and still a link.
 *
 * - The pointer listeners sit on the wrapper <li>, so grabbing the card body
 *   drags it; a plain click never reaches dnd-kit's activation distance and
 *   navigates as usual. The grip button keeps the full listeners (including
 *   the keyboard ones), which is what makes Tab, Space, arrows, Space work.
 * - History: an earlier version put the listeners on the card and the title
 *   link and a completed drag navigated to the issue, because the browser's
 *   click after a drag landed on the link. `useDragClickGuard` cancels exactly
 *   that click, and `draggable={false}` stops the browser's own native
 *   link-drag from competing with dnd-kit.
 * - The sortable transform/transition live on the <li>, and the Card inside
 *   keeps its own transition-shadow, so the hover shadow still animates
 *   (an inline `transition` on the Card itself would replace it).
 */
export function SortableIssueCard({
  issue,
  projectKey,
  assignee,
  onOpen,
  dragLabel = "Drag to reorder or move",
}: {
  issue: Issue;
  projectKey: string;
  /** The assignee's picture (a profile link with a hover card), built by the page; beside the issue link, not inside it. */
  assignee?: ReactNode;
  /** Open the issue in the side panel instead of navigating (modified clicks still navigate). */
  onOpen?: (issueId: string) => void;
  /** The grip button's accessible name. */
  dragLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
  });
  const guardClick = useDragClickGuard(isDragging);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : ""}
      {...pointerListeners(listeners)}
    >
      <Card hoverable className="flex items-start gap-2 select-none">
        <DragHandle aria-label={dragLabel} {...attributes} {...listeners} />
        <Link
          to={issuePath(projectKey, issue.number)}
          draggable={false}
          data-panel-trigger
          onClick={(event) => {
            guardClick(event);
            openIssueOnClick(event, onOpen, issueKey(projectKey, issue.number));
          }}
          className="block min-w-0 flex-1"
        >
          <IssueSummary issue={issue} projectKey={projectKey} />
        </Link>
        {assignee && <span className="shrink-0">{assignee}</span>}
      </Card>
    </li>
  );
}

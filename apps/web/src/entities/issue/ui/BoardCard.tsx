import { Link } from "react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Issue } from "@flowdesk/contracts";
import { Card } from "../../../shared/ui";
import { pointerListeners, useDragClickGuard } from "../lib/dragHelpers";
import { openIssueOnClick } from "../lib/issueLinkClick";
import { DragHandle } from "./DragHandle";
import { IssueSummary } from "./IssueSummary";

/**
 * Draggable via useSortable, from anywhere on the card, and still a link.
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
export function BoardCard({
  issue,
  projectKey,
  assigneeName,
  onOpen,
}: {
  issue: Issue;
  projectKey: string;
  assigneeName?: string | null;
  /** Open the issue in the side panel instead of navigating (modified clicks still navigate). */
  onOpen?: (issueId: string) => void;
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
        <DragHandle aria-label="Drag to reorder or move" {...attributes} {...listeners} />
        <Link
          to={`/projects/${issue.projectId}/issues/${issue.id}`}
          draggable={false}
          data-panel-trigger
          onClick={(event) => {
            guardClick(event);
            openIssueOnClick(event, onOpen, issue.id);
          }}
          className="block min-w-0 flex-1"
        >
          <IssueSummary issue={issue} projectKey={projectKey} assigneeName={assigneeName} />
        </Link>
      </Card>
    </li>
  );
}

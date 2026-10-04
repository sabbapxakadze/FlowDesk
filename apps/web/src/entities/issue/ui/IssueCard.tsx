import { Link } from "react-router";
import { issueKey, issuePath } from "../../../shared/lib/paths";
import { Button, Card, StatusBadge, type RowState } from "../../../shared/ui";
import type { Issue } from "../model";
import { openIssueOnClick } from "../lib/issueLinkClick";
import { IssueSummary } from "./IssueSummary";

/**
 * projectKey is passed in rather than looked up here — the issue itself
 * only carries projectId, and the parent page already has the project's
 * key loaded (see pages/project-detail), so no extra fetch is needed just
 * to render "AUTH-23".
 *
 * onEdit is optional and just a callback — this stays purely presentational
 * on purpose. entities can't import from features (FSD boundary), so the
 * actual edit form is composed in at the pages layer; this component only
 * knows "something wants to happen when Edit is clicked."
 */
export function IssueCard({
  issue,
  projectKey,
  assigneeName,
  onEdit,
  onOpen,
  rowState,
  rowIndex,
}: {
  issue: Issue;
  projectKey: string;
  assigneeName?: string | null;
  onEdit?: () => void;
  /** Open the issue in the side panel instead of navigating (modified clicks still navigate). */
  onOpen?: (issueId: string) => void;
  /** Motion of a row in a useAnimatedList list (see Card). */
  rowState?: RowState;
  rowIndex?: number;
}) {
  return (
    <Card as="li" hoverable rowState={rowState} rowIndex={rowIndex} className="flex items-start justify-between gap-2">
      <Link
        to={issuePath(projectKey, issue.number)}
        data-panel-trigger
        onClick={(event) => openIssueOnClick(event, onOpen, issueKey(projectKey, issue.number))}
        className="block min-w-0 flex-1"
      >
        <IssueSummary issue={issue} projectKey={projectKey} assigneeName={assigneeName}>
          <div className="mt-1.5">
            <StatusBadge status={issue.status} />
          </div>
        </IssueSummary>
      </Link>
      {onEdit && (
        <Button type="button" variant="link" className="shrink-0" onClick={onEdit}>
          Edit
        </Button>
      )}
    </Card>
  );
}

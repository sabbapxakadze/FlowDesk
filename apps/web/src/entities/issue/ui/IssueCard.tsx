import { Link } from "react-router";
import { Card, StatusBadge } from "../../../shared/ui";
import type { Issue } from "../model";
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
  onEdit,
}: {
  issue: Issue;
  projectKey: string;
  onEdit?: () => void;
}) {
  return (
    <Card as="li" hoverable className="flex items-start justify-between gap-2">
      <Link to={`/projects/${issue.projectId}/issues/${issue.id}`} className="block min-w-0 flex-1">
        <IssueSummary issue={issue} projectKey={projectKey}>
          <div className="mt-1.5">
            <StatusBadge status={issue.status} />
          </div>
        </IssueSummary>
      </Link>
      {onEdit && (
        <button onClick={onEdit} className="shrink-0 text-sm text-[var(--color-text-link)] underline">
          Edit
        </button>
      )}
    </Card>
  );
}

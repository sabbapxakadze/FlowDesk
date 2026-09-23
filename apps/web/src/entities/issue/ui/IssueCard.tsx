import { Link } from "react-router";
import type { Issue } from "../model";

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
    <li className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 px-4 py-3">
      <Link to={`/projects/${issue.projectId}/issues/${issue.id}`}>
        <p className="text-sm text-gray-500">
          {projectKey}-{issue.number}
        </p>
        <p className="font-medium">{issue.title}</p>
        <p className="text-xs text-gray-400">{issue.status}</p>
      </Link>
      {onEdit && (
        <button onClick={onEdit} className="text-sm text-blue-600 underline">
          Edit
        </button>
      )}
    </li>
  );
}

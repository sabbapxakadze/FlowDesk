import type { Issue } from "../model";

/**
 * projectKey is passed in rather than looked up here — the issue itself
 * only carries projectId, and the parent page already has the project's
 * key loaded (see pages/project-detail), so no extra fetch is needed just
 * to render "AUTH-23".
 */
export function IssueCard({ issue, projectKey }: { issue: Issue; projectKey: string }) {
  return (
    <li className="rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-sm text-gray-500">
        {projectKey}-{issue.number}
      </p>
      <p className="font-medium">{issue.title}</p>
    </li>
  );
}

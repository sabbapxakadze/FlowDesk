import { Link } from "react-router";
import type { Issue, IssueStatus } from "@flowdesk/contracts";
import { Card, Select, STATUS_LABELS } from "../../../shared/ui";

const ALL_STATUSES: IssueStatus[] = ["todo", "in_progress", "done"];

/**
 * Move affordances are all optional — a card rendered with none of them
 * looks exactly like slice 1's read-only version (used nowhere today,
 * but keeps this component usable standalone/in tests without wiring a
 * whole board). ProjectBoardPage computes canMoveUp/canMoveDown and the
 * actual neighbor ids from its own sorted column arrays — this stays
 * presentational, same as IssueCard's onEdit. No dnd-kit yet (slice 3).
 */
export function BoardCard({
  issue,
  projectKey,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onMoveToStatus,
}: {
  issue: Issue;
  projectKey: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveToStatus?: (status: IssueStatus) => void;
}) {
  return (
    <Card as="li" hoverable>
      <Link to={`/projects/${issue.projectId}/issues/${issue.id}`} className="block">
        <p className="text-sm text-[var(--color-text-muted)]">
          {projectKey}-{issue.number}
        </p>
        <p className="font-medium">{issue.title}</p>
      </Link>

      {(onMoveUp ?? onMoveDown ?? onMoveToStatus) && (
        <div className="mt-2 flex items-center gap-2">
          {onMoveUp && (
            <button
              onClick={onMoveUp}
              disabled={!canMoveUp}
              aria-label="Move up"
              className="text-sm text-[var(--color-text-link)] underline disabled:text-[var(--color-text-muted)] disabled:no-underline"
            >
              ↑
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={onMoveDown}
              disabled={!canMoveDown}
              aria-label="Move down"
              className="text-sm text-[var(--color-text-link)] underline disabled:text-[var(--color-text-muted)] disabled:no-underline"
            >
              ↓
            </button>
          )}
          {onMoveToStatus && (
            <Select
              value=""
              onChange={(e) => {
                const status = e.target.value;
                if (status) onMoveToStatus(status as IssueStatus);
              }}
              className="w-auto text-sm"
              aria-label="Move to another column"
            >
              <option value="">Move to…</option>
              {ALL_STATUSES.filter((s) => s !== issue.status).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
    </Card>
  );
}

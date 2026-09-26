import { Link } from "react-router";
import { Card } from "../../../shared/ui";
import type { Issue } from "../model";

/**
 * Read-only for now — no move affordances yet (slice 2 adds those, then
 * slice 3 replaces them with real drag & drop). A separate component
 * from IssueCard rather than a shared one with conditional props: the
 * board's per-card action set is going to diverge from the list's (move
 * controls vs. an Edit link) enough that one component covering both
 * would need awkward conditionals — same reasoning as Phase 4 slice 3's
 * "no single generic <List>" call. No StatusBadge here either — the
 * column header already says the status, repeating it on every card
 * would be redundant.
 */
export function BoardCard({ issue, projectKey }: { issue: Issue; projectKey: string }) {
  return (
    <Card as="li" hoverable>
      <Link to={`/projects/${issue.projectId}/issues/${issue.id}`} className="block">
        <p className="text-sm text-[var(--color-text-muted)]">
          {projectKey}-{issue.number}
        </p>
        <p className="font-medium">{issue.title}</p>
      </Link>
    </Card>
  );
}

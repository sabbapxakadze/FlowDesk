import type { ReactNode } from "react";
import { PriorityBadge } from "../../../shared/ui";
import type { Issue } from "../model";

/**
 * The issue "face": the key in small muted text above the title, with an
 * optional slot underneath. IssueCard, BoardCard, SprintIssueCard and the
 * board's drag overlay all render this, so the four cannot drift apart.
 */
export function IssueSummary({
  issue,
  projectKey,
  children,
}: {
  issue: Pick<Issue, "number" | "title" | "priority">;
  projectKey: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        {projectKey}-{issue.number}
        <PriorityBadge priority={issue.priority} />
      </p>
      <p className="font-medium">{issue.title}</p>
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { Avatar, PriorityBadge } from "../../../shared/ui";
import type { Issue } from "../model";

/**
 * The issue "face": the key in small muted text above the title, with an
 * optional slot underneath. IssueCard, BoardCard, SprintIssueCard and the
 * board's drag overlay all render this, so the four cannot drift apart.
 */
export function IssueSummary({
  issue,
  projectKey,
  assigneeName,
  children,
}: {
  issue: Pick<Issue, "number" | "title" | "priority">;
  projectKey: string;
  /** Resolved by the page (issues carry only an assignee id); null/absent = unassigned. */
  assigneeName?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        {projectKey}-{issue.number}
        <PriorityBadge priority={issue.priority} />
        {assigneeName && (
          <span className="ml-auto">
            <Avatar name={assigneeName} label={`Assigned to ${assigneeName}`} />
          </span>
        )}
      </p>
      <p className="font-medium">{issue.title}</p>
      {children}
    </div>
  );
}

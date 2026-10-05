import type { ReactNode } from "react";
import { DueDate, PriorityBadge } from "../../../shared/ui";
import type { Issue } from "../model";

/**
 * The issue "face": the key in small muted text above the title, with an
 * optional slot underneath. IssueCard, SortableIssueCard and the
 * board's drag overlay all render this, so the four cannot drift apart.
 */
export function IssueSummary({
  issue,
  projectKey,
  assignee,
  children,
}: {
  issue: Pick<Issue, "number" | "title" | "priority" | "dueDate" | "status">;
  projectKey: string;
  /** The assignee's picture, built by the page (it knows the members; entities cannot import each other). Shown at the right of
   *  the first line. Cards that are links leave it out and render the interactive one beside the link instead. */
  assignee?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        {projectKey}-{issue.number}
        <PriorityBadge priority={issue.priority} />
        <DueDate dueDate={issue.dueDate} done={issue.status === "done"} />
        {assignee && <span className="ml-auto">{assignee}</span>}
      </p>
      <p className="font-medium">{issue.title}</p>
      {children}
    </div>
  );
}

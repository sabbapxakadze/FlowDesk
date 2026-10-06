import type { ReactNode } from "react";
import { Link } from "react-router";
import { issueKey, issuePath } from "../../../shared/lib/paths";
import {
  Button,
  Card,
  DueDate,
  PriorityBadge,
  StatusBadge,
  type RowState,
} from "../../../shared/ui";
import type { Issue } from "../model";
import { openIssueOnClick } from "../lib/issueLinkClick";

/**
 * The Issues list is one surface of two-line rows under a header strip (ADR 0036), not a stack of cards. Rows and header share
 * this grid. It is chosen by the LIST's own width (a container query: the page puts `@container` on the surface), not the
 * window's, so the list also stacks when the issue side panel narrows it:
 *  - wide: Issue | Status | Priority | Due | Who | Edit, as columns, with the header strip above;
 *  - narrow: the issue block, then Who and Edit at its right, and status / priority / due on a second line; no header.
 */
const COLUMNS = "@3xl:grid-cols-[minmax(0,1fr)_7rem_5.5rem_7.5rem_2rem_2.5rem]";

// Edit stays out of the way until you point at the row or tab into it, so a long list is not a column of buttons; on a touch
// screen (no hover) it is always visible. The same reveal the comment cards use.
const REVEAL =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

/** The column labels above the rows. Wide layout only; the narrow one has no columns to label. Decoration: the list itself is the `ul`. */
export function IssueListHeader() {
  return (
    <div
      aria-hidden="true"
      className={`hidden gap-x-3 border-b border-[var(--color-border-default)] bg-[var(--color-border-default)]/30 px-3.5 py-1.5 text-xs text-[var(--color-text-muted)] @3xl:grid ${COLUMNS}`}
    >
      <span>Issue</span>
      <span>Status</span>
      <span>Priority</span>
      <span>Due</span>
      <span>Who</span>
      <span />
    </div>
  );
}

/**
 * projectKey is passed in rather than looked up here: the issue itself only carries projectId, and the parent page already has
 * the project's key loaded (see pages/project-detail), so no extra fetch is needed just to render "AUTH-23".
 *
 * `onEdit` is a callback, so this stays presentational: entities cannot import features (FSD boundary), the page composes the
 * edit popup in. Same for `assignee` and `labels`, which the page builds (they are profile links and filter buttons: neither can sit
 * inside the issue link, since a link cannot hold another link or a button).
 */
export function IssueRow({
  issue,
  projectKey,
  assignee,
  labels,
  onEdit,
  onOpen,
  rowState,
  rowIndex,
}: {
  issue: Issue;
  projectKey: string;
  assignee?: ReactNode;
  labels?: ReactNode;
  onEdit?: () => void;
  /** Open the issue in the side panel instead of navigating (modified clicks still navigate). */
  onOpen?: (issueId: string) => void;
  /** Motion of a row in a useAnimatedList list (see Card). */
  rowState?: RowState;
  rowIndex?: number;
}) {
  const key = issueKey(projectKey, issue.number);
  return (
    <Card
      as="li"
      rowState={rowState}
      rowIndex={rowIndex}
      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-none border-t border-[var(--color-border-default)] bg-transparent px-3.5 py-2.5 shadow-none first:border-t-0 hover:bg-[var(--color-border-default)]/40 ${COLUMNS}`}
    >
      <div className="col-start-1 row-start-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={issuePath(projectKey, issue.number)}
            data-panel-trigger
            onClick={(event) => openIssueOnClick(event, onOpen, key)}
            className="min-w-0"
          >
            <p className="font-medium [overflow-wrap:anywhere]">{issue.title}</p>
          </Link>
          {labels}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{key}</p>
      </div>

      <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 @3xl:contents">
        <span>
          <StatusBadge status={issue.status} />
        </span>
        <span>
          {issue.priority === "none" ? (
            <span className="hidden text-xs text-[var(--color-text-muted)] @3xl:inline">
              -
            </span>
          ) : (
            <PriorityBadge priority={issue.priority} />
          )}
        </span>
        <span>
          <DueDate dueDate={issue.dueDate} done={issue.status === "done"} />
        </span>
      </div>

      <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 @3xl:contents">
        <span className="@3xl:justify-self-start">{assignee}</span>
        {onEdit ? (
          <Button
            type="button"
            variant="link"
            className={`shrink-0 justify-self-end ${REVEAL}`}
            onClick={onEdit}
          >
            Edit
          </Button>
        ) : (
          <span />
        )}
      </div>
    </Card>
  );
}

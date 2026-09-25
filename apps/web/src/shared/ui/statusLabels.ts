import type { IssueStatus } from "@flowdesk/contracts";

/** Own module, not exported from StatusBadge.tsx — a component file
 * exporting a plain constant breaks Fast Refresh (react-refresh/
 * only-export-components). Shared by StatusBadge and any status filter
 * UI (e.g. ProjectDetailPage) that needs the same label set. */
export const STATUS_LABELS: Record<IssueStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
};

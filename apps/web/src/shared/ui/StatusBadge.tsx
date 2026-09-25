import type { IssueStatus } from "@flowdesk/contracts";
import { STATUS_LABELS } from "./statusLabels";

/**
 * Complete literal class strings in a lookup table, not a template
 * literal built from the status value — same reason DesignSystemPage's
 * TokenSwatch does this: Tailwind's JIT scanner reads literal source
 * text, so a dynamically-assembled class name is invisible to it.
 */
const STATUS_DOT_CLASSES: Record<IssueStatus, string> = {
  todo: "bg-[var(--color-status-todo)]",
  in_progress: "bg-[var(--color-status-in-progress)]",
  done: "bg-[var(--color-status-done)]",
};

/** A colored dot + label, not a filled pill — status is a fixed 3-value
 * enum (see semantic.css's --color-status-* tokens), and a small dot
 * indicator reads clearly without needing a tinted background per status. */
export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)]">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASSES[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

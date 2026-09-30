import { STATUS_DOT_CLASSES } from "../../../shared/ui";
import type { SprintStatus } from "../model";

/**
 * A sprint's status as a dot and a label, the same visual language as an
 * issue's StatusBadge. The three sprint states reuse the three status
 * colours (planned = not started, active = in progress, completed = done), so
 * no new tokens.
 */
const CONFIG: Record<SprintStatus, { label: string; dot: string }> = {
  planned: { label: "Planned", dot: STATUS_DOT_CLASSES.todo },
  active: { label: "Active", dot: STATUS_DOT_CLASSES.in_progress },
  completed: { label: "Completed", dot: STATUS_DOT_CLASSES.done },
};

export function SprintStatusBadge({ status }: { status: SprintStatus }) {
  const { label, dot } = CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

import { ChevronDown, ChevronUp, ChevronsUp, Minus, type LucideIcon } from "lucide-react";
import type { IssuePriority } from "@flowdesk/contracts";
import { PRIORITY_LABELS } from "./priorityLabels";

const ICONS: Record<Exclude<IssuePriority, "none">, LucideIcon> = {
  urgent: ChevronsUp,
  high: ChevronUp,
  medium: Minus,
  low: ChevronDown,
};

// Only the two that need attention get a colour; the rest stay muted so a
// board full of medium and low issues does not look like a wall of alerts.
const COLOR: Record<IssuePriority, string> = {
  urgent: "text-[var(--color-text-danger)]",
  high: "text-[var(--color-text-warning)]",
  medium: "text-[var(--color-text-muted)]",
  low: "text-[var(--color-text-muted)]",
  none: "text-[var(--color-text-muted)]",
};

/**
 * An icon plus a label, never colour alone. Renders nothing for "none": most
 * issues have no priority and an empty marker on every card is noise.
 */
export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  if (priority === "none") return null;
  const Icon = ICONS[priority];
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${COLOR[priority]}`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

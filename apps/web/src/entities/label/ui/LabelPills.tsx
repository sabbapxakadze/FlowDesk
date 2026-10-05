import { LabelBadge } from "./LabelBadge";

/**
 * A short row of label pills for an issue card: the first `max` labels, then "+n" for the rest. With `onToggle` each pill
 * is a button that picks that label as a filter; the pills of the labels already chosen are ringed. Without it they are
 * plain pills. Pure presentation: the page owns the filter.
 */
export function LabelPills({
  labels,
  activeIds = [],
  onToggle,
  max = 3,
}: {
  labels: { id: string; name: string; color: string }[];
  activeIds?: string[];
  onToggle?: (labelId: string) => void;
  max?: number;
}) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {shown.map((label) =>
        onToggle ? (
          <button
            key={label.id}
            type="button"
            aria-pressed={activeIds.includes(label.id)}
            aria-label={`Filter by label ${label.name}`}
            onClick={() => onToggle(label.id)}
            className={`rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)] ${
              activeIds.includes(label.id) ? "ring-2 ring-[var(--color-border-focus)] ring-offset-1 ring-offset-[var(--color-bg-surface)]" : ""
            }`}
          >
            <LabelBadge label={label} />
          </button>
        ) : (
          <LabelBadge key={label.id} label={label} />
        ),
      )}
      {labels.length > max && <span className="text-xs text-[var(--color-text-muted)]">+{labels.length - max}</span>}
    </div>
  );
}

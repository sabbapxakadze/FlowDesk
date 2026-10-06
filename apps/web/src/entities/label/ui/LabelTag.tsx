import type { Label } from "../model";

/**
 * A quiet label for dense places (the board and sprint cards): a small outlined tag with the label's own color as a dot and the
 * name in the normal text color, instead of the filled pill (`LabelBadge`). Like the badge, the color is the label's own data, so it
 * is an inline style, not a design token. Plain: it is not a button.
 */
export function LabelTag({ label }: { label: Pick<Label, "name" | "color"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-default)] px-1.5 text-xs leading-5">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
    </span>
  );
}

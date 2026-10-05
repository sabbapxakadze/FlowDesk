import { X } from "lucide-react";
import type { Label } from "../model";

/**
 * The color is the label's own data (like a GitHub/Linear label color),
 * not a design-system choice — that's why this is a raw inline style
 * instead of a semantic token, unlike the rest of the app's chrome.
 */
export function LabelBadge({
  label,
  onRemove,
}: {
  label: Pick<Label, "name" | "color">;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: label.color }}
    >
      {label.name}
      {onRemove && (
        // type="button": inside the issue editor's form a bare button is a SUBMIT button, and removing a label saved and closed the editor
        <button type="button" onClick={onRemove} aria-label={`Remove ${label.name}`} className="leading-none">
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

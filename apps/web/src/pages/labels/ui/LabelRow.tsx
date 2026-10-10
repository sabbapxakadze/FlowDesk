import type { ReactNode } from "react";
import type { Label } from "@flowdesk/contracts";
import { LabelBadge } from "../../../entities/label";
import { useTimezone } from "../../../shared/lib/timezone";
import { useRowMotionProps, type RowState } from "../../../shared/ui";

/** The columns of the Labels list (the header strip uses the same). Below the container width the row stacks: pill, then colour and date, then the buttons. */
export const LABEL_COLUMNS = "@2xl:grid-cols-[minmax(0,1fr)_9rem_8rem_auto]";

/**
 * One label as a row of the single list surface: its pill, its colour (a dot and the hex code) and the day it was made, then the Edit and Delete buttons
 * (`actions`). While it is being edited the row holds `editing` (the inline form) instead. Rows open, flash and close like the other animated lists.
 */
export function LabelRow({
  label,
  state,
  index,
  editing,
  actions,
}: {
  label: Label;
  state: RowState;
  index: number;
  editing: ReactNode | null;
  actions: ReactNode;
}) {
  const timezone = useTimezone();
  const { ref, className, style } = useRowMotionProps<HTMLLIElement>(state, index);
  const created = new Date(label.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: timezone ?? undefined });
  return (
    <li ref={ref} style={style} className={`px-3.5 py-2.5 ${className}`}>
      {editing ?? (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 @2xl:grid ${LABEL_COLUMNS}`}>
          <div className="min-w-0">
            <LabelBadge label={label} />
          </div>
          <span className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
            <span aria-hidden="true" className="h-3 w-3 rounded-full border border-[var(--color-border-default)]" style={{ backgroundColor: label.color }} />
            {label.color.toUpperCase()}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">{created}</span>
          <div className="flex items-start gap-2">{actions}</div>
        </div>
      )}
    </li>
  );
}

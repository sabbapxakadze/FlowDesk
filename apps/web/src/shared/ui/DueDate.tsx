import { CalendarDays } from "lucide-react";
import { formatDueDate, isOverdue, todayKey } from "../lib/dueDate";
import { useTimezone } from "../lib/timezone";

/**
 * A due date as a small chip: a calendar icon and the day. A day before today (in the person's timezone) on unfinished
 * work reads "Overdue" in the danger colour, so it is never colour alone. `done` is passed in, so this stays free of the
 * domain. Renders nothing without a date.
 */
export function DueDate({ dueDate, done }: { dueDate: string | null; done: boolean }) {
  const timezone = useTimezone();
  if (!dueDate) return null;
  const today = todayKey(timezone);
  const overdue = isOverdue(dueDate, done, today);
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${overdue ? "text-[var(--color-text-danger)]" : "text-[var(--color-text-muted)]"}`}
      title={overdue ? `Overdue: was due ${dueDate}` : `Due ${dueDate}`}
    >
      <CalendarDays aria-hidden className="h-3.5 w-3.5" />
      {overdue ? "Overdue " : ""}
      {formatDueDate(dueDate, today)}
    </span>
  );
}

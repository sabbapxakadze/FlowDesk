import { browserTimezone } from "./timezone";

/**
 * Due dates are calendar days ("YYYY-MM-DD"), not moments (ADR 0032). "Today" is the person's own calendar day: in their
 * chosen timezone (ADR 0031), else the browser's. Comparing two "YYYY-MM-DD" strings as text is correct because the
 * format sorts the same as the dates do.
 */

/** Today's calendar day in the given IANA timezone (null = the browser's), as "YYYY-MM-DD". */
export function todayKey(timezone: string | null, now: Date = new Date()): string {
  // The "en-CA" locale writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? browserTimezone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Overdue: the day is before today, and the work is not finished. Due TODAY is not overdue. */
export function isOverdue(dueDate: string | null, done: boolean, today: string): boolean {
  return dueDate !== null && !done && dueDate < today;
}

/** "Oct 12" (and the year when it is not the current one), written from the day itself so no timezone can move it. */
export function formatDueDate(dueDate: string, today: string): string {
  const withYear = dueDate.slice(0, 4) !== today.slice(0, 4);
  // Midnight UTC formatted in UTC: the same calendar day everywhere (like the throughput chart's week labels).
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) }).format(
    new Date(`${dueDate}T00:00:00Z`),
  );
}

/** The calendar day `days` after (or before, if negative) a "YYYY-MM-DD" day, as "YYYY-MM-DD". Done in UTC, so no timezone or daylight-saving change can move it. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

import { formatRelativeTime } from "./formatRelativeTime";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How a moment is written next to a comment, an activity line or a row: "5 minutes ago" for the first day (it reads live), then the
 * actual date and time in the person's own timezone ("Oct 9, 3:42 PM", with the year when it is not this year there). `timeZone` is the
 * account's IANA name, or null for the browser's own. `locale` and `now` are parameters so the result can be checked against fixed values.
 */
export function formatTime(iso: string, timeZone: string | null, now: number = Date.now(), locale?: string): string {
  const moment = new Date(iso);
  if (Math.abs(moment.getTime() - now) < DAY_MS) return formatRelativeTime(iso, now);
  const zone = timeZone ? { timeZone } : {};
  const year = (ms: number) => new Intl.DateTimeFormat("en-US", { ...zone, year: "numeric" }).format(ms);
  return new Intl.DateTimeFormat(locale, {
    ...zone,
    month: "short",
    day: "numeric",
    ...(year(moment.getTime()) === year(now) ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(moment);
}

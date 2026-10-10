import { useTimezone } from "../lib/timezone";
import { formatTime } from "./lib/formatTime";

/**
 * A time in a real <time> element: "5 minutes ago" for the first day, then the actual date and time ("Oct 9, 3:42 PM"), always in the person's
 * own timezone (account page), or the browser's when none is set. The full date and time, with the zone's name, is on hover and for assistive tech.
 * It does not tick: a refetch (live update, window focus) refreshes it.
 */
export function Time({ iso, className }: { iso: string; className?: string }) {
  const timeZone = useTimezone();
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long", ...(timeZone ? { timeZone } : {}) })} className={className}>
      {formatTime(iso, timeZone)}
    </time>
  );
}

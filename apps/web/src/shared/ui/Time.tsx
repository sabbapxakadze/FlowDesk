import { useTimezone } from "../lib/timezone";
import { formatRelativeTime } from "./lib/formatRelativeTime";

/**
 * A relative time ("5 minutes ago") in a real <time> element, with the exact
 * date and time on hover and for assistive tech. It does not tick: a refetch
 * (live update, window focus) refreshes it. The exact time is in the person's own
 * timezone (account page), or the browser's when none is set.
 */
export function Time({ iso, className }: { iso: string; className?: string }) {
  const timeZone = useTimezone();
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString(undefined, timeZone ? { timeZone } : undefined)} className={className}>
      {formatRelativeTime(iso)}
    </time>
  );
}

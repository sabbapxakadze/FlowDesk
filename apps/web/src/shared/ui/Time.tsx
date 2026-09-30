import { formatRelativeTime } from "./lib/formatRelativeTime";

/**
 * A relative time ("5 minutes ago") in a real <time> element, with the exact
 * date and time on hover and for assistive tech. It does not tick: a refetch
 * (live update, window focus) refreshes it.
 */
export function Time({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={className}>
      {formatRelativeTime(iso)}
    </time>
  );
}

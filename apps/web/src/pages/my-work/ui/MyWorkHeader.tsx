import type { ReactNode } from "react";
import { Card, Skeleton } from "../../../shared/ui";
import type { Summary } from "../lib/week";
import { ProgressRing } from "./ProgressRing";

function SummarySentence({ summary, total }: { summary: Summary; total: number }) {
  if (total === 0) return <p className="mt-1 text-sm text-[var(--color-text-muted)]">Nothing is assigned to you yet.</p>;
  const strong = "font-medium text-[var(--color-text-default)]";
  const parts: ReactNode[] = [];
  if (summary.overdue > 0) parts.push(<span key="o" className="font-medium text-[var(--color-text-danger)]">{summary.overdue} overdue</span>);
  if (summary.dueThisWeek > 0) parts.push(<span key="d" className={strong}>{summary.dueThisWeek} due this week</span>);
  if (summary.inProgress > 0) parts.push(<span key="p" className={strong}>{summary.inProgress} in progress</span>);
  const start = summary.startWith;
  return (
    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
      {parts.length === 0 ? (
        <>
          <span className={strong}>
            {total} open {total === 1 ? "issue" : "issues"}
          </span>
          , none due this week.
        </>
      ) : (
        parts.flatMap((part, index) => (index === 0 ? [part] : [index === parts.length - 1 ? " and " : ", ", part]))
      )}
      {parts.length > 0 && "."}
      {start && (
        <>
          {" "}
          Start with <span className={strong}>{start.projectKey}-{start.number}</span>.
        </>
      )}
    </p>
  );
}

/**
 * The top of My work (owner's pick D2a, 2026-10-10): the date and a greeting for the person's own time of day, one sentence about
 * what is on, the week ring, and the New issue button. The page's real <h1> is "My work" (hidden, so the tab, the tour and screen
 * readers keep the name); the greeting is the visible heading. The soft teal band is built from tokens, so dark mode follows.
 */
export function MyWorkHeader({
  dateLabel,
  greeting,
  summary,
  total,
  ring,
  ringCaption,
  action,
}: {
  dateLabel: string;
  greeting: string;
  /** Null while the list loads. */
  summary: Summary | null;
  total: number;
  /** Null while it loads. */
  ring: { done: number; total: number } | null;
  ringCaption: string;
  action: ReactNode;
}) {
  return (
    <Card className="mb-5 flex flex-wrap items-center justify-between gap-4 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--color-accent-500)_30%,transparent),color-mix(in_oklab,var(--color-aurora-2)_18%,transparent))] p-5">
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)]">{dateLabel}</p>
        <p className="font-display text-3xl [overflow-wrap:anywhere]">{greeting}</p>
        {summary ? <SummarySentence summary={summary} total={total} /> : <Skeleton className="mt-2 h-5 w-64 max-w-full" />}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {ring === null ? (
            <Skeleton className="h-[72px] w-[72px] rounded-full" />
          ) : ring.total === 0 ? null : (
            <ProgressRing done={ring.done} total={ring.total} />
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{ring === null ? "" : ring.total === 0 ? "Nothing with a due date this week" : ringCaption}</p>
        </div>
        {action}
      </div>
    </Card>
  );
}

import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";

/**
 * The shared replay from ADR 0009, as a CTE fragment both metrics splice
 * into their WITH list. `transitions` has one row per status-bearing event
 * with the issue's PREVIOUS status beside it (LAG over that issue's own
 * events, default 'todo' because every issue is created as todo). A row
 * is a real transition only when status <> prev_status: issue.updated
 * carries `status` even when it didn't change (EditIssueForm resends the
 * current status on every edit), so the payload alone can't be trusted,
 * and issue.moved can be a same-column reorder. Keeping this in one place
 * means throughput and cycle time can never disagree about what a
 * transition is.
 */
function statusTransitions(organizationId: string, projectId: string) {
  return sql`
    status_events AS (
      SELECT e.id, e.issue_id, e.created_at,
             COALESCE(e.payload->>'toStatus', e.payload->>'status') AS status
      FROM issue_events e
      JOIN issues i ON i.id = e.issue_id
      WHERE i.organization_id = ${organizationId}::uuid
        AND i.project_id = ${projectId}::uuid
        AND e.type IN ('issue.moved', 'issue.updated')
        AND COALESCE(e.payload->>'toStatus', e.payload->>'status') IS NOT NULL
    ),
    transitions AS (
      SELECT issue_id, created_at, status,
             LAG(status, 1, 'todo') OVER (PARTITION BY issue_id ORDER BY created_at, id) AS prev_status
      FROM status_events
    )`;
}

/**
 * Issues completed per week for one project, oldest week first, always
 * exactly `weeks` rows (empty weeks are 0, not missing). Read straight
 * from issue_events — see docs/adr/0009-analytics-from-events.md.
 *
 * A "completion" is a transition into `done` from another status. A
 * reopened issue that is finished again counts again — this is
 * throughput of completions, not of distinct issues.
 *
 * Raw sql for the window function + generate_series, same "drop to sql
 * when the builder can't express it" precedent as search() and
 * nextRankSql. `now` is a parameter so tests don't depend on the clock.
 * Weeks are UTC, Monday-start (date_trunc('week')).
 */
export async function throughputByWeek(
  organizationId: string,
  projectId: string,
  weeks: number,
  now: Date = new Date(),
): Promise<Array<{ weekStart: string; completed: number }>> {
  const result = await db.execute<{ week_start: string; completed: number }>(sql`
    WITH current_week AS (
      SELECT date_trunc('week', ${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date AS week_start
    ),
    week_series AS (
      SELECT (current_week.week_start - (n * 7))::date AS week_start
      FROM current_week, generate_series(0, ${weeks}::int - 1) AS n
    ),
    ${statusTransitions(organizationId, projectId)},
    completions AS (
      SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
      FROM transitions
      WHERE status = 'done' AND prev_status <> 'done'
    )
    SELECT to_char(w.week_start, 'YYYY-MM-DD') AS week_start,
           COUNT(c.week_start)::int AS completed
    FROM week_series w
    LEFT JOIN completions c ON c.week_start = w.week_start
    GROUP BY w.week_start
    ORDER BY w.week_start
  `);

  return result.rows.map((row) => ({ weekStart: row.week_start, completed: row.completed }));
}

/**
 * Cycle time for issues finished inside the window — see
 * docs/adr/0010-cycle-time-definition.md. Per issue: the FIRST entry into
 * in_progress (re-entering later doesn't reset the clock) to the first
 * completion at or after it (a later reopen-and-finish is throughput's
 * business, not a second cycle). Issues that were completed without ever
 * being in progress have no cycle time and are counted in `withoutStart`.
 * The window is the same N Monday-start UTC weeks as throughput, judged
 * by when the issue was first finished.
 *
 * Averages/percentiles are of the unrounded values, rounded to one
 * decimal only at the end; buckets use the unrounded days too, with an
 * inclusive lower bound (exactly 1.0 day is "1-3 days").
 */
export async function cycleTime(
  organizationId: string,
  projectId: string,
  weeks: number,
  now: Date = new Date(),
): Promise<{
  summary: {
    completed: number;
    withoutStart: number;
    averageDays: number | null;
    medianDays: number | null;
    p90Days: number | null;
  };
  distribution: Array<{ label: string; count: number }>;
}> {
  const withCycles = sql`
    WITH current_week AS (
      SELECT date_trunc('week', ${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date AS week_start
    ),
    window_start AS (
      SELECT (week_start - ((${weeks}::int - 1) * 7))::timestamp AS at FROM current_week
    ),
    ${statusTransitions(organizationId, projectId)},
    started AS (
      SELECT issue_id, MIN(created_at) AS started_at
      FROM transitions
      WHERE status = 'in_progress' AND prev_status <> 'in_progress'
      GROUP BY issue_id
    ),
    finished AS (
      SELECT t.issue_id, MIN(t.created_at) AS done_at
      FROM transitions t
      JOIN started s ON s.issue_id = t.issue_id
      WHERE t.status = 'done' AND t.prev_status <> 'done' AND t.created_at >= s.started_at
      GROUP BY t.issue_id
    ),
    cycles AS (
      SELECT EXTRACT(EPOCH FROM (f.done_at - s.started_at)) / 86400.0 AS days
      FROM finished f
      JOIN started s ON s.issue_id = f.issue_id, window_start w
      WHERE f.done_at AT TIME ZONE 'UTC' >= w.at
    ),
    first_done AS (
      SELECT issue_id, MIN(created_at) AS done_at
      FROM transitions
      WHERE status = 'done' AND prev_status <> 'done'
      GROUP BY issue_id
    )`;

  const summaryResult = await db.execute<{
    completed: number;
    without_start: number;
    average: number | null;
    median: number | null;
    p90: number | null;
  }>(sql`
    ${withCycles}
    SELECT
      COUNT(*)::int AS completed,
      (SELECT COUNT(*) FROM first_done d, window_start w
        WHERE d.done_at AT TIME ZONE 'UTC' >= w.at
          AND NOT EXISTS (SELECT 1 FROM finished f WHERE f.issue_id = d.issue_id))::int AS without_start,
      ROUND(AVG(days)::numeric, 1)::float8 AS average,
      ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY days))::numeric, 1)::float8 AS median,
      ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY days))::numeric, 1)::float8 AS p90
    FROM cycles
  `);

  const bucketResult = await db.execute<{ label: string; count: number }>(sql`
    ${withCycles}
    SELECT b.label, COUNT(c.days)::int AS count
    FROM (VALUES
      (1, '< 1 day', 0, 1),
      (2, '1-3 days', 1, 3),
      (3, '3-7 days', 3, 7),
      (4, '1-2 weeks', 7, 14),
      (5, '2-4 weeks', 14, 28),
      (6, '4+ weeks', 28, NULL)
    ) AS b(ord, label, lo, hi)
    LEFT JOIN cycles c ON c.days >= b.lo AND (b.hi IS NULL OR c.days < b.hi)
    GROUP BY b.ord, b.label
    ORDER BY b.ord
  `);

  const row = summaryResult.rows[0];
  return {
    summary: {
      completed: row?.completed ?? 0,
      withoutStart: row?.without_start ?? 0,
      averageDays: row?.average ?? null,
      medianDays: row?.median ?? null,
      p90Days: row?.p90 ?? null,
    },
    distribution: bucketResult.rows.map((b) => ({ label: b.label, count: b.count })),
  };
}

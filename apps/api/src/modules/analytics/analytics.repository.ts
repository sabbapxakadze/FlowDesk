import { and, asc, desc, eq, ne, notExists, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issueLabels, issues, labels } from "../../db/schema/index.js";

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
    ${statusEvents(organizationId, projectId)},
    transitions AS (
      SELECT issue_id, created_at, status,
             LAG(status, 1, 'todo') OVER (PARTITION BY issue_id ORDER BY created_at, id) AS prev_status
      FROM status_events
    )`;
}

/**
 * Just the status-bearing events, for callers that don't need the replay
 * (velocity only asks "what was the last status at or before time T").
 *
 * NOT MATERIALIZED is load-bearing, found by measurement in Phase 8 slice 5:
 * Postgres materializes a CTE that is referenced more than once, and
 * velocity's per-release "last status before T" lookup then rescanned the
 * whole materialized set for every release row instead of using the
 * (issue_id, created_at) index — 3.7 s at 20,000 issues versus 22 ms
 * inlined. Even a second reference from a CTE that is never used counts, so
 * the hint keeps a future edit from silently reintroducing that.
 */
function statusEvents(organizationId: string, projectId: string) {
  return sql`
    status_events AS NOT MATERIALIZED (
      SELECT e.id, e.issue_id, e.created_at,
             COALESCE(e.payload->>'toStatus', e.payload->>'status') AS status
      FROM issue_events e
      JOIN issues i ON i.id = e.issue_id
      WHERE i.organization_id = ${organizationId}::uuid
        AND i.project_id = ${projectId}::uuid
        AND e.type IN ('issue.moved', 'issue.updated')
        AND COALESCE(e.payload->>'toStatus', e.payload->>'status') IS NOT NULL
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

  // One query, one replay: the buckets are FILTER counts over the same
  // `cycles` rows the summary aggregates. Two queries used to run the whole
  // replay twice (~2x the time at 20,000 issues). The bounds come from code
  // constants above, never from input, so sql.raw is safe here.
  const bucketColumns = sql.join(
    CYCLE_BUCKETS.map(
      (b, i) =>
        sql.raw(
          `COUNT(*) FILTER (WHERE days >= ${b.lo}${b.hi === null ? "" : ` AND days < ${b.hi}`})::int AS b${i}`,
        ),
    ),
    sql`, `,
  );

  const result = await db.execute<Record<string, number | null>>(sql`
    ${withCycles}
    SELECT
      COUNT(*)::int AS completed,
      (SELECT COUNT(*) FROM first_done d, window_start w
        WHERE d.done_at AT TIME ZONE 'UTC' >= w.at
          AND NOT EXISTS (SELECT 1 FROM finished f WHERE f.issue_id = d.issue_id))::int AS without_start,
      ROUND(AVG(days)::numeric, 1)::float8 AS average,
      ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY days))::numeric, 1)::float8 AS median,
      ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY days))::numeric, 1)::float8 AS p90,
      ${bucketColumns}
    FROM cycles
  `);

  const row = result.rows[0];
  return {
    summary: {
      completed: row?.completed ?? 0,
      withoutStart: row?.without_start ?? 0,
      averageDays: row?.average ?? null,
      medianDays: row?.median ?? null,
      p90Days: row?.p90 ?? null,
    },
    distribution: CYCLE_BUCKETS.map((b, i) => ({ label: b.label, count: row?.[`b${i}`] ?? 0 })),
  };
}

/** Fixed buckets, inclusive lower bound; `hi: null` is open-ended. Days. */
const CYCLE_BUCKETS: ReadonlyArray<{ label: string; lo: number; hi: number | null }> = [
  { label: "< 1 day", lo: 0, hi: 1 },
  { label: "1-3 days", lo: 1, hi: 3 },
  { label: "3-7 days", lo: 3, hi: 7 },
  { label: "1-2 weeks", lo: 7, hi: 14 },
  { label: "2-4 weeks", lo: 14, hi: 28 },
  { label: "4+ weeks", lo: 28, hi: null },
];

/**
 * The most recent `limit` completed sprints, oldest first, each with how
 * many issues were in it when it closed (`committed`) and how many of
 * those were done at that moment (`completed`). See
 * docs/adr/0011-sprint-velocity-from-completion-events.md.
 *
 * Membership comes from the issue.sprint_removed events complete() writes
 * with reason 'sprint_completed' — one per issue in the sprint, in the same
 * transaction — because complete() clears issues.sprint_id and the table
 * can no longer say who was in a past sprint. An issue taken out by hand
 * before the close has a plain sprint_removed (no reason) and is rightly
 * not counted.
 *
 * "Done" is the issue's status AS OF its release event (the last status-
 * bearing event at or before it), not its status today: finishing an issue
 * after the sprint closed doesn't retroactively credit that sprint, and
 * reopening it later doesn't take the credit away.
 *
 * A completed sprint with no issues has no events, so it comes from the
 * sprints table via LEFT JOIN and shows as 0 / 0. sprints.updated_at is
 * the close time: complete() sets it and no endpoint edits a completed
 * sprint afterward.
 */
export async function sprintVelocity(
  organizationId: string,
  projectId: string,
  limit: number,
): Promise<
  Array<{ sprintId: string; name: string; completedAt: Date | string; committed: number; completed: number }>
> {
  const result = await db.execute<{
    sprint_id: string;
    name: string;
    completed_at: Date | string;
    committed: number;
    completed: number;
  }>(sql`
    WITH ${statusEvents(organizationId, projectId)},
    releases AS (
      SELECT e.issue_id, e.created_at, e.payload->>'sprintId' AS sprint_id
      FROM issue_events e
      JOIN issues i ON i.id = e.issue_id
      WHERE i.organization_id = ${organizationId}::uuid
        AND i.project_id = ${projectId}::uuid
        AND e.type = 'issue.sprint_removed'
        AND e.payload->>'reason' = 'sprint_completed'
    ),
    released_status AS (
      SELECT r.sprint_id,
             COALESCE(
               (SELECT se.status FROM status_events se
                 WHERE se.issue_id = r.issue_id AND se.created_at <= r.created_at
                 ORDER BY se.created_at DESC, se.id DESC
                 LIMIT 1),
               'todo') AS status
      FROM releases r
    ),
    per_sprint AS (
      SELECT sprint_id,
             COUNT(*)::int AS committed,
             COUNT(*) FILTER (WHERE status = 'done')::int AS completed
      FROM released_status
      GROUP BY sprint_id
    )
    SELECT * FROM (
      SELECT sp.id AS sprint_id, sp.name, sp.updated_at AS completed_at,
             COALESCE(ps.committed, 0)::int AS committed,
             COALESCE(ps.completed, 0)::int AS completed
      FROM sprints sp
      LEFT JOIN per_sprint ps ON ps.sprint_id = sp.id::text
      WHERE sp.organization_id = ${organizationId}::uuid
        AND sp.project_id = ${projectId}::uuid
        AND sp.status = 'completed'
      ORDER BY sp.updated_at DESC
      LIMIT ${limit}::int
    ) latest
    ORDER BY completed_at ASC
  `);

  return result.rows.map((row) => ({
    sprintId: row.sprint_id,
    name: row.name,
    completedAt: row.completed_at,
    committed: row.committed,
    completed: row.completed,
  }));
}

// --- Breakdowns: a snapshot of CURRENT state, so these read the tables
// directly (no event replay) — docs/adr/0012-breakdowns-read-current-state.md.

/** One row per status that has issues; the service zero-fills the rest. */
export async function statusCounts(organizationId: string, projectId: string) {
  return db
    .select({ status: issues.status, count: sql<number>`count(*)::int` })
    .from(issues)
    .where(and(eq(issues.organizationId, organizationId), eq(issues.projectId, projectId)))
    .groupBy(issues.status);
}

/**
 * Open (not done) issues per label, most-used first, ties by name. An issue
 * with two labels appears under both — issue_labels has one row per
 * (issue, label), so count(*) per label is a count of distinct issues.
 * Both the issue and the label are scoped to the organization: the label
 * table is org-level, and the join must not be the only tenant guard.
 */
export async function openLabelCounts(organizationId: string, projectId: string) {
  return db
    .select({ labelId: labels.id, name: labels.name, count: sql<number>`count(*)::int` })
    .from(issueLabels)
    .innerJoin(issues, eq(issueLabels.issueId, issues.id))
    .innerJoin(labels, eq(issueLabels.labelId, labels.id))
    .where(
      and(
        eq(issues.organizationId, organizationId),
        eq(issues.projectId, projectId),
        eq(labels.organizationId, organizationId),
        ne(issues.status, "done"),
      ),
    )
    .groupBy(labels.id, labels.name)
    .orderBy(desc(sql`count(*)`), asc(labels.name));
}

/** Open issues that carry no label at all. */
export async function openUnlabeledCount(organizationId: string, projectId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issues)
    .where(
      and(
        eq(issues.organizationId, organizationId),
        eq(issues.projectId, projectId),
        ne(issues.status, "done"),
        notExists(db.select({ one: sql`1` }).from(issueLabels).where(eq(issueLabels.issueId, issues.id))),
      ),
    );
  return row?.count ?? 0;
}

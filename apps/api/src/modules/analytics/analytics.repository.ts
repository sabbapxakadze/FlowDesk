import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";

/**
 * Issues completed per week for one project, oldest week first, always
 * exactly `weeks` rows (empty weeks are 0, not missing). Read straight
 * from issue_events — see docs/adr/0009-analytics-from-events.md.
 *
 * A "completion" is an event that puts an issue into `done` when its
 * previous status wasn't `done`. The previous status comes from
 * replaying that issue's own status-bearing events in order (LAG), not
 * from the event payload alone: issue.updated carries `status` even when
 * it didn't change (EditIssueForm resends the current status on every
 * edit), so trusting the payload would invent completions. LAG's default
 * is 'todo' because every issue is created as todo. A reopened issue
 * that is finished again counts again — this is throughput of
 * completions, not of distinct issues.
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
      SELECT created_at, status,
             LAG(status, 1, 'todo') OVER (PARTITION BY issue_id ORDER BY created_at, id) AS prev_status
      FROM status_events
    ),
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

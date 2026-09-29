# 0009 — Analytics are computed from issue_events, on read

Status: Accepted (Phase 8, slice 1)

## Context

Phase 8 needs throughput, cycle time, sprint velocity and breakdowns.
Issues have no `done_at`/`started_at`, no estimates, and (ADR 0008)
completing a sprint clears `issues.sprint_id` for every issue in it. The
only complete history of what happened and when is `issue_events`
(ADR 0005), which already says analytics is one of its readers.

A wrinkle found in the code: `issue.updated` carries `payload.status`
even when the status did not change, because the edit form resends the
current status on every save. Only `issue.moved` (`fromStatus`/
`toStatus`) is an unambiguous transition.

## Decision

1. **Compute on read** from `issue_events` with SQL, no rollup or
   summary tables. Nothing to keep in sync, nothing that can drift from
   the source of truth. Revisit only if `EXPLAIN ANALYZE` on realistic
   volume (planned for the last slice) says it is too slow.
2. **Transitions come from replaying an issue's own events in order**,
   not from a single payload. For each issue, take its status-bearing
   events (`issue.moved` -> `toStatus`, `issue.updated` -> `status`) and
   compare each to the previous one with `LAG(...)`, defaulting to
   `todo` (every issue is created as todo). A transition is real only if
   the status differs from the previous one.
3. **"Completed" = a transition into `done`.** Throughput counts
   *completions*: an issue that is reopened and finished again counts
   again. It is throughput of work finishing, not of distinct issues.
4. **Weeks are UTC and Monday-start**, zero-filled so a chart always
   gets exactly N points regardless of activity.
5. **Metrics count issues, not points** — there is no estimate field.
6. **Per project, existing `view_issue` permission.** No new
   permission; analytics exposes nothing a viewer of the project's
   issues cannot already see. Org-wide rollups are not built.
7. **A dedicated `analytics` module** with its own contract file: it is
   a growing set of read-only queries across events, issues, sprints and
   labels, not one more way to query issues.

## Consequences

- Correct against the real quirks of the data (unchanged-status
  updates, same-column reorders, reopens), and the tests pin each one.
- Queries scan a project's events on every request. Fine now; the
  `(issue_id, created_at)` index helps, and slice 5 measures it.
- Timestamps are the event's `created_at`. Backdating for demo data must
  insert events with explicit timestamps (the seed does).
- Sprint velocity (slice 3) cannot read `issues.sprint_id` after a
  sprint completes; it needs event replay or a snapshot at completion.
  Deferred to that slice's own decision.

## Alternatives rejected

- **Materialized/rollup tables:** faster reads but a second copy of the
  truth that can drift; not justified before measuring.
- **Trust `payload.status` on `issue.updated`:** simple, and wrong — it
  counts phantom completions on every edit of a done issue.
- **Add `done_at` to `issues`:** a second source of truth that must be
  maintained in every mutation path and cannot represent reopens.

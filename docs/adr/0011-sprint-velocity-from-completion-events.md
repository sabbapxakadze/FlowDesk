# 0011 — Sprint velocity comes from the completion events

Status: Accepted (Phase 8, slice 3)

## Context

Velocity is how much a team finishes per sprint. The obvious source,
`issues.sprint_id`, cannot answer it for a past sprint: ADR 0008 has
`complete()` set `sprint_id = NULL` on every issue in the sprint, so once a
sprint closes the table no longer says who was in it. We had planned to
either replay assign/remove events to rebuild membership, or add a
snapshot column written at completion.

Reading `complete()` showed neither is needed. In the same transaction as
the status change it writes one `issue.sprint_removed` event per issue in
the sprint, for every status, with `{ sprintId, sprintName, reason:
"sprint_completed" }`. Those events are already a snapshot of the sprint's
membership at the moment it closed.

## Decision

1. **Members at close = issues with a `sprint_completed` release event
   naming that sprint.** No schema change; works for every sprint
   completed since ADR 0008 shipped. An issue removed by hand before the
   close has a `sprint_removed` without that reason and is correctly
   excluded.
2. **"Completed" = done as of the release event, not today.** Status is the
   last status-bearing event (the same events ADR 0009 replays) at or
   before the release event. Finishing an issue after the sprint closed
   does not retroactively credit the sprint; reopening it later does not
   remove the credit.
3. **Per sprint: `committed` (members at close), `completed` (done at
   close); carried over is `committed - completed`.** Issues, not points.
4. **Which sprints:** the most recent N completed sprints (`?sprints=`,
   default 8, max 20) ordered by close time, returned oldest first.
   `sprints.updated_at` is the close time: `complete()` sets it and no
   endpoint edits a completed sprint. A completed sprint with no issues is
   still a data point (0 / 0).
5. **Headline = mean `completed` across the returned sprints**, computed in
   the service.

## Consequences

- Correct retroactively, no backfill, and it keeps analytics purely
  event-derived (ADR 0009).
- Depends on `complete()` continuing to write the reasoned release events.
  A test built on the real `complete()` pins that dependency, so changing
  it would fail loudly rather than skew the chart.
- The close time relies on `updated_at` staying untouched after completion.
  If a future feature edits completed sprints, add an explicit
  `completed_at` column first.
- An issue that completed inside the sprint but was manually removed before
  close is not counted for it. That matches "in the sprint when it ended".

## Alternatives rejected

- **Snapshot column at completion:** only covers sprints completed after it
  ships and duplicates information the events already hold.
- **Replay every assign/remove event to reconstruct membership:** more SQL
  and more ways to be wrong for no extra accuracy, since the release events
  already state the answer.
- **Status "now" instead of at close:** would make an old sprint's velocity
  change as issues are finished or reopened later.

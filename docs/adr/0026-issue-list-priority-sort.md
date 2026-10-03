# 0026 — Sorting the issue list by priority

Status: Accepted — 2026-10-03.

## Context

The project's issue list was ordered by creation time only (newest or oldest first), paged with
a keyset cursor on `(created_at, id)` served by `issues_project_id_created_at_id_idx`
(Phase 4). Priority (Phase 8.5 slice 2A) could be filtered but not sorted by. The board has its
own manual order (drag and drop) and the sprints backlog is unpaginated, so only the list needs
this.

## Decision

- **A `sort` query parameter** (`created` by default, or `priority`) beside the existing `order`.
  `order` is the direction of the WHOLE sort key. `sort=priority&order=desc` is urgent first and,
  within one priority, newest first; `asc` reverses all of it (lowest priority first, oldest
  first). Postgres orders enum values by declaration order (none < low < medium < high < urgent),
  so `ORDER BY priority DESC` needs no mapping table.
- **One row-constructor cursor comparison.** Because every component of the key moves in the same
  direction, `(priority, created_at, id) < (cursor)` is exact, the same shape the created sort
  already used (and verified to compile to a real index condition). The cursor carries the last
  row's priority only for the priority sort. A cursor made for one sort is refused (`invalid_cursor`)
  by the other, and one with an unknown priority value is refused too: replaying a cursor against a
  different ordering would silently skip or repeat rows.
- **New index** `issues_project_id_priority_created_at_id_idx (project_id, priority, created_at, id)`,
  migration 0020. Measured on 20,000 issues in one project: the first page took 7.6 ms without it
  (scan and sort the whole project) and 0.05 ms with it (26 rows read); the page after row 9,000
  took 5.7 ms and 0.06 ms. Both are fast at this size; the difference is that the unindexed cost
  grows with the project and the indexed cost does not. The price is one more index to maintain on
  issue inserts and priority edits.
- **UI:** the "Newest first" button became a **Sort** dropdown (Newest first, Oldest first, Highest
  priority first). The choice lives in the URL (`?sort=priority`, `?order=asc`, or neither), like
  the filters. "Lowest priority first" is not offered: issues with no priority would come first and
  bury the real low-priority ones. The API supports it.
- **Not changed:** the board (manual rank), the sprints backlog, search ranking.

## Consequences

- Within a priority the order follows `order` (newest first by default). There is no secondary
  sort the user can choose.
- Priority ties are broken by creation time then id, so the order is deterministic and a page
  boundary can fall anywhere inside a group of equal priorities without losing rows (tested with
  limits 1 to 7 over groups of six).
- Changing an issue's priority while someone is paging through a sorted list can move rows between
  pages (inherent to keyset paging over a mutable column); a refetch shows the new order.

## Alternatives rejected

- **A CASE expression ranking "none" last in both directions:** gives a friendlier ascending sort
  but defeats the index and complicates the cursor.
- **Sorting on the client:** wrong with pagination (only 25 rows are loaded).
- **OFFSET paging:** already rejected for the created sort (cost grows with the page number).

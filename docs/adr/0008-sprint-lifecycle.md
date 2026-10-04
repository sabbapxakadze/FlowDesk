# 0008 — Sprint lifecycle

Status: Accepted — 2026-09-27

## Context

Phase 5's roadmap bullet for its last slice was thin: "sprints: create,
assign issues, backlog vs active." That's enough to know sprints exist
and issues move between a backlog and one of them, but not enough to
design a schema or an API from — it doesn't say whether a sprint can be
planned ahead of the moment it starts, whether more than one can be
active, or what happens to a sprint's issues once it ends. Those are
real modeling decisions, made explicitly with the project owner before
writing any code (see the Phase 5 slice 4 plan).

## Decision

**Three-state lifecycle — `planned` → `active` → `completed`** — not a
minimal two-state (`active`/`completed`) model. A minimal model still
needs a transition to ever reuse the "active" slot for a second sprint,
so it isn't actually less machinery, just less realistic: it can't
represent a sprint planned ahead of when the current one ends, which is
how every real tool in this space (Jira, Linear) actually works.

**At most one active sprint per project, enforced by the database** — a
partial unique index (`UNIQUE (project_id) WHERE status = 'active'`),
not just a check in the service layer before the write. This is the
same "the database is the source of truth for the invariant" pattern
already used for unique project keys and label names (Phase 2/3): a
`start()` call is a conditional `UPDATE ... WHERE status = 'planned' AND
version = $expected`, and if another sprint in the project is already
active, the index violation itself is what stops it — caught and
translated to a `409 sprint_already_active` in `sprints.service.ts`,
never trusted to a race-prone "check then write."

**Completing a sprint returns its remaining issues to the backlog in
the same transaction as the status change** — `sprints.repository.ts`'s
`complete()` sets `sprint_id = NULL` on every issue still in that
sprint immediately after the conditional `UPDATE` succeeds, and writes
one `issue.sprint_removed` event per affected issue
(`payload: { sprintId, sprintName, reason: "sprint_completed" }`).
`reason` is what lets the activity timeline phrase an automatic
end-of-sprint release ("moved back to the backlog (Sprint 1
completed)") differently from a manual drag-to-backlog
(`issue.sprint_removed` with no `reason`), without a second event type —
same precedent as `issue.moved`'s payload carrying detail instead of
proliferating event types (ADR 0005).

**Assigning an issue to a sprint is an issue mutation, not a sprint
one** — `PATCH .../issues/:issueId/sprint` (`{ version, sprintId: string
| null }`, `null` meaning "move to the backlog") lives in the `issues`
module, the same shape and same conditional-`UPDATE`-on-`version`
pattern as the board's `move` endpoint (ADR 0007's Phase 5 slice 2).
`sprintId` is validated against the caller's own project/org before the
write (defense in depth, same reasoning as `move`'s neighbor
validation), not left to the foreign key alone to produce a less useful
error.

**No within-list ordering for the backlog or the active sprint** —
issues are listed by `createdAt` within each list, not a second
fractional rank. ADR 0007's whole ranking scheme exists to answer "where
exactly does this card sit among its neighbors," which the Kanban board
genuinely needs and this slice's roadmap bullet does not ask for
(backlog-vs-active *membership*, not backlog *prioritization order*).
Reusing that machinery here would be copying the board's most complex
piece for a requirement that was never stated.

**Drag-and-drop via `@dnd-kit/core`'s plain `useDraggable`/`useDroppable`,
not `@dnd-kit/sortable`** — for the same reason: this page only needs
membership in one of two containers, not insert-before-this-card
ordering, so the lighter primitive is the correct amount of complexity,
not a simplification of something that should have been more. Same
dedicated-drag-handle fix as `BoardCard` (Phase 5 slice 3): the whole
card can't be the drag source, or a completed drag's synthetic click
re-fires on the title `<Link>` and navigates away instead of landing
the drop.

**No new permission** — sprints reuse `view_issue`/`manage_issue`, the
same reasoning as labels (Phase 3 slice 3): sprints only exist to
organize issues, and CLAUDE.md's permission map is deliberately kept
small rather than growing one-to-one with every new noun in the schema.

## Consequences

- Planning ahead is possible: a project can hold several `planned`
  sprints at once, and `start()` picking one to promote is the only
  place the single-active-sprint constraint is ever tested.
- The backlog view (`GET .../backlog`) can always answer "what's the
  active sprint, and what's in it" with a single query pass and no
  client-side coordination of separate requests — same "compose the
  whole page in one unpaginated call" precedent as `getBoard` (ADR
  0007), extended to a case where the composed shape spans two
  entities (`sprints` and `issues`) instead of one.
- A completed sprint's issues are never silently orphaned mid-sprint —
  they always land back in the backlog, visible and re-plannable,
  rather than needing a manual sweep.
- The audit trail stays complete for sprint-driven changes without a
  parallel "sprint history" concept: everything that happened to an
  issue, including an automatic end-of-sprint release, is one more row
  in `issue_events`, read through the same timeline every other issue
  mutation already uses.

## Alternatives rejected

- **Minimal `active`/`completed` model, no `planned` state** — rejected
  explicitly with the owner (see the Phase 5 slice 4 plan's "Decisions")
  because it still needs a transition to reuse the active slot, so the
  only thing actually saved is the ability to plan a future sprint
  ahead of time — a real capability, not a nice-to-have, given away for
  no real reduction in complexity.
- **A service-layer-only "is one already active?" check before
  `start()`** — rejected the same way the unique-project-key and
  unique-label-name checks were: a check-then-write has a real race
  window between two concurrent `start()` calls; the partial unique
  index closes it structurally instead of by hoping the check runs
  first.
- **Reusing ADR 0007's fractional `board_rank` scheme for backlog/sprint
  ordering** — rejected as unnecessary complexity for a requirement
  that was never asked for; `createdAt` ordering is correct for
  "membership in one of two lists" and can be revisited if backlog
  prioritization order is ever actually requested.

## Amendment 2026-10-04: the sprints-page lists are ordered, and scroll inside lanes

The owner asked to drag issues up and down inside the Backlog and the active sprint like on the board, so the
"no within-list ordering" and "plain `useDraggable`" decisions above no longer hold.

- **A second rank, `issues.backlog_rank`** (migration 0024, nullable, backfilled, NOT NULL, like ADR 0007's
  `board_rank`). One rank per issue for WHICHEVER list it is in: the backlog (`sprint_id IS NULL`) or one sprint.
  It is meaningless across lists. Backfill kept the creation order. A separate column (not `board_rank`), so
  prioritising the backlog never moves a card on the board.
- **Same scheme as ADR 0007** (numeric, bisection between neighbours, rebalance when the gap is exhausted). The
  four ranking helpers now take a small "rank list" (which rank column, which rows) so the board's columns and
  the sprints-page lists share them. One difference: a first place in a backlog list is "one step below the first
  rank", because new issues are put on top with ranks below zero and half of a negative number is HIGHER (found by
  a test); the board keeps halving, as its ranks are always positive.
- **Where things go:** a new issue is first in the backlog; the issues of a completed sprint return to the top of
  the backlog in the order they had; a drag drops at the exact place; assigning without neighbours (the API) appends
  to the end of the target list.
- **API:** `PATCH .../issues/:id/sprint` takes optional `prevIssueId` / `nextIssueId` (same meaning as the board's
  move; both must be in the target list, else 400 `invalid_neighbor`). A move between lists keeps
  `issue.sprint_assigned` / `issue.sprint_removed` and their notifications. A reorder inside one list writes the new
  `issue.reordered`, an audit row with NO notification (grooming must not wake everyone who touched the issue).
  The Sprints list is returned newest first.
- **Web:** both lists are `@dnd-kit/sortable` lists with a live preview, using the drag logic extracted from the board
  into `shared/dnd/multiList` (BoardCard became `SortableIssueCard`; SprintIssueCard is gone). Each list is a `Lane`
  (a panel a shade apart from the page, `--color-bg-lane`, lighter than the cards in dark mode), header fixed, body
  scrolling inside with a slim always-visible scrollbar. From `sm` up the board and the sprints page fit the window
  (the page does not scroll; the sprints page keeps a 44rem minimum): a lane is as tall as its content, at least 16rem
  and at most the space left, and scrolls past that. Lanes are NOT stretched to the tallest one (a 6-card Todo next to
  a 79-card Done is a short box; owner feedback, same day). While a card is dragged every lane keeps at least the
  height it had when the drag began (`Lane freezeHeight`), so the drop targets do not move under the pointer. The
  Sprints list is capped at about 4 rows; on a phone everything stacks at its natural height.
- **Rejected:** reusing `board_rank` (couples the two orders), a plain priority sort (no manual order), a capped
  height with the page also scrolling (two scrollbars on top of each other), no container around columns (a short
  column left a blank page).

# 0061 - The full issue page: a properties card and a narrower column

Status: Accepted - 2026-10-11. A look-only change: no API, contract or data change. The side panel (ADR 0025) is unchanged. Builds on ADR 0032 (due dates) and 0057.

## Context

The full issue page was one wide column with a loose row of chips under the title (status, priority, due date, assignee, Edit) and the labels under that. The owner asked whether there was a design for it, saw three mockups (a Details sidebar,
a properties card under the title, and a header band with tabs) and picked **B, the properties card**.

## Decisions

1. **Edit moves to the right of the title** (a secondary button; it was a link in the meta row). The title row keeps the page header's line under it.
2. **A properties card under the title:** Status, Priority, Assignee, Due, Labels, Reporter, Created, Updated as labelled values in a grid (two columns on a phone, four from `sm`). Empty values say so: "Unassigned", "No due date", "None" (labels),
   "Not in the organization" for a reporter who has left. The labels keep their `role="group"` and name "Labels". Created and Updated use the app's `Time` (relative for the first day, then the date and time in the person's timezone, ADR 0031).
3. **The description is in its own card** under a "Description" heading, with "No description." when there is none. Attachments and Activity keep their places, with smaller section headings on the page.
4. **The content is a centered column** at most `max-w-3xl` (768px) inside the page frame, so lines stay readable on a wide window.
5. **The panel keeps its compact layout** (the meta row, no properties card); `IssueDetail` renders both, so the page and panel share every other part (comments, files, live updates).

## Consequences

- The page is taller above the activity: on a short window (about 800px) the timeline's bottom edge is below the fold at rest, so the e2e test of "the bottom edge is on screen" now uses a taller window.
- The "Someone is also viewing" line sits under the title (page) as before.

## Tests

- e2e (`issue-page.spec.ts`, 3): the card shows all eight properties with the issue's real values and the description card; an unassigned issue with no due date and no description says so; the side panel has no properties card.
  A fourth test that measured the column's width was removed in the same pass as the layout-only tests (see the roadmap). The existing issue, comment, panel, due-date, assignee, priority, activity and scroll specs pass on the new page.
- Not looked at in Safari or Firefox; the built page was seen in the mockups and passed its tests, but was not screenshotted.

## Test suite pruning (2026-10-11)

The owner asked for fewer tests. 40 browser tests were removed: those that only pinned pixels or animation internals (button positions and spacing, column alignment, exact widths, CSS animation classes and timers, and the reduced-motion duplicates of those; 22 of them from
`motion.spec.ts`). What stays: permissions, saving, deleting, drag and drop, keyboard and screen-reader access, live updates, sessions, the cheap "does not scroll sideways" checks on complex pages, and the tests of the issue panel's behaviour. The motion language (ADR 0029) is now
checked by eye, not by test. 302 browser tests became 262.

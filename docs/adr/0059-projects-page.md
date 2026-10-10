# 0059 - The Projects page: cards with their numbers

Status: Accepted - 2026-10-11. Builds on ADR 0032 (due dates and "today"), 0008 (sprints) and 0057 (the My work redesign).

## Context

The Projects page was a plain list: a card per project with its name and key, and the "create project" form sitting above it. The owner found it too plain and asked for options. Four full-page mockups were rendered (cards in a grid,
a table, a summary band with cards, and the same list polished); the owner chose **A, the cards**, then asked to leave out per-project colours.

## Decisions

1. **A card per project, in a grid** that fits as many columns as the page has room for (`repeat(auto-fill, minmax(18rem, 1fr))`, so it follows the page's width, not the window's): a tile with the project's initials, the name and key,
   "Updated ...", a progress bar ("31 of 55 done", a percentage), the counts (open, in progress, overdue), and the running sprint with the days left, or "No active sprint". A project with no issues says "No issues yet" and shows no bar.
2. **One accent for every project.** The tile and the bar use the app's teal; red appears only for overdue. No per-project colour, no new tokens, and nothing stored. The tile letters are the initials of the name (the first letters of its first
   two words, or the first two letters of one word), so projects whose keys start alike (APP, API) are told apart.
3. **One new read for all the numbers:** `GET /organizations/:id/projects/summary?today=` returns, per project, `open`, `inProgress`, `overdue`, `done`, `total`, `activeSprint` (name and end date) and `lastChangeAt`. A grouped query on the
   issues with `LEFT JOIN` from projects (so an empty project still returns zeros) plus one query for the active sprints (the database allows at most one per project). "Overdue" is a due day before the caller's `today` on an issue that is not done
   (ADR 0032; without `today` the server's UTC day). Scoped through the project's organization; any member who can see projects can read it (`view_project`). The list of projects and the numbers are two requests: the cards appear first and the numbers
   fill in a moment later (placeholders until then).
4. **"Updated" is the latest change to any issue of the project** (`max(issues.updated_at)`), which is cheap. A true "last activity" counting comments would scan the event table for every project and grow with the data. A comment does not move it.
5. **"New project" is a button and a popup** (shown only to owners and admins, who are the only ones the API lets create a project), like New issue and New label; the inline form is gone. The popup refuses an empty name, closes on success,
   and invalidates the project list and with it the numbers (`projectKeys.summaries` sits under `projectKeys.list`).
6. **The page re-reads when it opens**; it does not listen for live changes (it does not join project rooms as My work does), so numbers change on the next visit or window focus.

## Tests

- API (`projects.summary.http.test.ts`, 4): the counts and their edges (a done issue is not open and never overdue, due today is not overdue, no date is never overdue), an empty project returns zeros with no sprint and no last change, only a running
  sprint is reported (a planned one is not), another organization's projects never appear, 403 for a non-member, 401 signed out, 400 for a bad date. Making "overdue" count done issues too failed the first test.
- Web unit (`projectCard.test.ts`, 4): initials for several names and the key fallback; "N days left", "1 day left", "ends today", "ended yesterday", "ended N days ago", no end date, across a month end.
- e2e (`projects-page.spec.ts`, 5): a card shows "1 of 4 done", 25 %, 3 open, 1 in progress, 1 overdue, the sprint and its days left, and opens its project; an empty project says so; the popup refuses an empty name, creates, closes, and Cancel creates nothing;
  a plain member sees no New project button; the button sits above the header's line (a layout bug the owner found). Specs that used the inline form were updated.

## Named limits and not verified

- Numbers are as of the page's last read, not live.
- With very many projects the single grouped query is still one pass over all their issues (fine at the sizes tested elsewhere, not measured here for this query).
- Checked in the test browser only (Chromium). Not looked at on a phone screen by eye, in Safari or in Firefox. The card was seen in the mockup renders in dark and light, but the built page was not screenshotted.

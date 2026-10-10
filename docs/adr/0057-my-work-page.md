# 0057 - The My work page (a week agenda with a ring, an overdue card and the side panel)

Status: Accepted - 2026-10-10. Builds on ADR 0031 (timezone), 0032 (due dates), 0025 (side panel) and 0040 (tour). Replaces the plain "Assigned to me" list of 2026-10-05.

## Context

My work (`/`) was one flat list of the first 10 open issues assigned to the person, plus the unread notifications. The owner found it too plain and
asked for options. Four rounds of full-page mockups followed (a numbers-first page, a "do next" page, grouping by project, and eight versions of a
week view); the owner chose **D2a**: a header band with a greeting and a progress ring, the week as an agenda, and a right-hand side. Later, while
looking at it with realistic data, the owner changed three things: the one-click Start / Done / Tomorrow buttons were removed (they were built, then
dropped), the page must not scroll (its lists scroll inside their own areas), and an issue must open in the side panel like everywhere else.

## Decisions

1. **Layout.** A header card (the person's date and a "Good morning / afternoon / evening, <first name>" line for THEIR time of day, one sentence
   of counts, the week ring, a New issue button); below it two columns from the `lg` width: the week agenda on the left, and on the right "Needs you
   today", the unread notifications and "Recently updated". The page's real `<h1>` is "My work" (visually hidden), so the tab, the tour and screen
   readers keep the name.
2. **Everything is in the person's own day.** "Today", the week (Monday to Sunday), the greeting hour and the date line use the account timezone
   (ADR 0031), else the browser's. The shown week is in the address as `?week=<Monday>`; a bad value shows this week.
3. **The agenda.** One row per day; Monday to Friday always, Saturday and Sunday only when something is due or it is today; then "No due date".
   **Every dated issue sits in its own day, overdue ones included, with the red "Overdue" chip**, so browsing back shows where work was due (the
   owner could not find issues overdue since Oct 2 to 4 when overdue issues were drawn only on the right). Overdue issues are also all listed,
   earliest first, in "Needs you today" (no cap: the right side scrolls).
4. **The ring** is "of my issues due in the shown week, how many are done" (e.g. 3/5). A new `GET .../my-work/week?from=&to=` counts them in one
   query on the issues table (assignee = me, organization-scoped through the project, due date in the range, both days included). Done issues
   are not in the open list, so this is the only place they are counted. Issues without a due date are not counted. The simpler definition was chosen
   over "finished this week" because that needs the event replay of ADR 0009.
5. **The list loads up to 50** open issues (the API's maximum) once and is sorted into days in the browser (`pages/my-work/lib/week.ts`, plain
   `YYYY-MM-DD` arithmetic, so no timezone or daylight-saving change can move an issue). More than 50 are counted and named, not drawn.
6. **No page scroll on a wide screen.** The agenda and the right side are `ScrollPanel`s with `fitWindow`, which caps their height to the room left
   in the window; a new `bottomGap` (40 px here) keeps the box clear of the page's own bottom padding so the page itself has nothing to scroll.
   Below `lg` the columns stack and the page scrolls normally.
7. **The side panel.** A plain click on an issue (tile, overdue card, "Recently updated") opens it in the panel (`?issue=WEB-12`, ADR 0025); Ctrl,
   Cmd, Shift or a middle click keeps the link. `MyWorkIssuePanel` finds the project from the key in the address, because this page spans projects.
   While the panel is open the content keeps clear of it below 1560 px, as the issue list does. Notifications still open the full page (ADR 0025).
8. **Tiles** use the card's own colour with a thin border and the priority edge. The first version used the "lane" colour, which is darker than a card
   in light mode and lighter in dark mode (measured from the tokens: about 94% against 100% in light, 32% against 26.9% in dark).
9. **New issue** on this page (`NewIssueAnywhere`) asks which project when there are several (the project of the first assigned issue is
   preselected), then opens the usual popup. No "C" shortcut here: the project pages own that key (ADR 0035).
10. **The tour** (ADR 0040) has two new steps that go to `/` and point at the agenda and the overdue card (16 steps now), and the My work step's text
    describes the new page.

11. **It is live.** The owner noticed an edit did not show without a reload. `useLiveMyWork` joins the room of every project of the organization and, on
    any issue change or deletion (or a deleted project), re-reads the page (`issueKeys.myWork`: the list and the ring). Edits made in the panel, on the board or by
    someone else all arrive the same way, because the server broadcasts to the whole room. Cost: one room per project for as long as the page is open.

## Not built, on purpose

- Start / Done / Tomorrow buttons on the cards (built, shown to the owner, removed at their request). That also removed the `version` field that had
  been added to the assigned-issue contract for them.
- A project colour on tiles (no setting exists for it).

## Tests

- API (`my-work.http.test.ts`, 3 new): the ring counts done and all with both end days included and ignores undated issues, scopes to me and to my
  organization, and answers 400 to a backwards or bad range, 401 signed out. Three deliberate breaks (start day exclusive, end day exclusive, person
  filter removed) each failed a test.
- Web unit (`week.test.ts`, `greeting.test.ts`, 9): Monday-of-week for every day including Sunday and across a month and a year, `?week=` fallbacks,
  bucketing (today and Sunday in the week, next Monday not, overdue earliest first, a past week shows its overdue issues on their days), the summary
  sentence's numbers, greeting boundaries, and the hour and date written for a chosen timezone.
- e2e: the page's old checks updated; the ring; no page scroll at 1440x700 with both areas scrollable; Previous / Next / Today and a bad `?week=`; the
  project picker; a change through the API (assign, finish, rename) showing at once with no reload; the panel (open, swap, Esc, reload, Open full page); an overdue issue on its own day when going back; the two tour steps.
  Existing specs that looked for the old "Hello, name" line now look for the greeting.

## Named limits and not verified

- Only the 50 most recently changed open issues are drawn.
- The ring ignores done issues that never had a due date.
- Checked in the test browser only (Chromium: screenshots at 1440x900 in dark and light, and the no-scroll test at 1440x700). Not checked: Safari, Firefox, a phone-sized screen by eye
  (the tests run one at 420 px for the tour only), and the owner's real data beyond one look.
- The e2e run logged "ResizeObserver loop completed with undelivered notifications" from Vite's client. **Fixed later the same day:** `ScrollPanel`'s re-fit now runs in the next animation frame
  instead of inside the observer's own callback (its likely cause, not isolated by a separate test). A 4.3 minute run of 57 tests that used to show the message several times showed it none.
- Behind the panel the page still scrolls its own lists; keyboard focus handling is the panel's (ADR 0025).

# 0032 - Issue due dates and the overdue marker

Status: Accepted - 2026-10-05.

## Context

Issues had a priority and an assignee but no due date. The owner asked for due dates with an overdue marker (the first open
item of the Phase 8.5 product list) and picked: set it in the edit popup (not at creation), an Overdue / No due date filter, and
a change notifies the people on the issue like any other edit.

## Decision

- **A due date is a calendar day, not a moment.** `issues.due_date` is a Postgres `date`, nullable, with no default (so the
  migration needs no backfill). It travels as `"YYYY-MM-DD"` (`z.iso.date()`, as sprint dates do) and is never turned into a
  timestamp, so no timezone can move it to another day.
- **Overdue = the day is before today, and the issue is not done.** "Today" is the person's own calendar day: in their chosen
  timezone (ADR 0031), else the browser's. The browser computes it (`shared/lib/dueDate.ts`) and shows it (`shared/ui/DueDate`):
  a calendar icon, the date, and the word "Overdue" in the danger colour, never colour alone. Due today is not overdue.
- **The list filter agrees with the marker.** `?due=overdue` sends `today` (the browser's calendar day) with the request, so the
  server compares with the same "today" the cards use; without `today` (a hand-written call) it uses the server's UTC day.
  `?due=none` lists issues without a date. Both are plain filters on top of the project's selective `project_id`, so no index.
- **Set through the existing PATCH.** `dueDate` joins the version-checked update; an unchanged date writes no event or version
  bump; clearing sends `null` and the event keeps the key (`{dueDate: null}`) so the timeline can say "removed the due date".
- **Notifications: nothing special.** The change is an ordinary `issue.updated` event, so past participants are told, as for a
  priority change. The profile activity feed's allow-list includes `dueDate`.

## Trade-offs, named

- Overdue is judged on the client from a calendar day, so two people in different timezones can disagree about "today" for a few
  hours. That is what "your own day" means.
- No "due soon" state, no due-date sort, no reminder emails when something becomes overdue (there are no background jobs yet).
- A date cannot be set while creating an issue (the owner's pick); it is set afterwards.

## Alternatives rejected

- A timestamp column: invites a time of day nobody asked for and makes "the same day for everyone" depend on a timezone.
- An `overdue` flag computed and stored by the server: needs a job to flip it at midnight, in whose timezone?
- A due-date sort: needs a new keyset cursor and index (as ADR 0026); the filter answers "what is late" without it.

# 0039 - The demo organization

Status: Accepted - 2026-10-06.

## Context

Phase 9 needs something to point a visitor at: a login that shows the product with data worth looking at. The old seed was thin (two empty projects and
100 generic "Demo issue N" rows with a fake user that could not log in). The owner asked for a demo account (`demo@flowdesk.test`, password `Demo123!@#`) over
very good, testable data.

## Decision

- **`pnpm db:seed:demo`** (`apps/api/src/db/seed-demo.ts`, content in `seed-demo-data.ts`) builds "FlowDesk Demo" when it is missing and does nothing when it exists.
  **`--reset`** deletes that organization and the five demo users and builds it again: the way to undo what a visitor changed, and to refresh the dates.
  It refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`, because a script that deletes an organization by name must never be pointed at real data by accident.
- **Five people, one per role, one shared password.** Alex Morgan `demo@flowdesk.test` (Owner), Nino Beridze (Admin), Marcus Lee and Sofia Rossi (Members), Daniel Okafor (Viewer);
  all `@flowdesk.test`, which can never receive mail, so a password-reset email cannot reach anyone. They have job titles, short bios and different timezones. The owner sees every feature
  (members, audit log, settings, deleting); logging in as the others shows what a member or a viewer can and cannot do.
- **Data worth testing:** three projects (Website Redesign `WEB`, Mobile App `APP`, Platform API `API`), 76 issues; 8 labels (some issues carry four, to show "+n"); every status, priority and assignee
  including unassigned; due dates relative to the day it runs (overdue, this week, next month, none); four completed sprints, an active one and a planned one in WEB (three completed in APP and API), with
  the same sprint events the real code writes so Velocity works (ADR 0011) and one issue that carries over; finished work spread over about nine weeks so Throughput and Cycle time look real; 23 comments with
  real `@mention` tokens (ADR 0033), some edited and one deleted; nine notifications for the owner (five unread); two pending invitations; a 17-row audit log.
- **Direct inserts with explicit timestamps**, as the analytics seed does: the real repositories stamp `now()` and fan out notifications, so they cannot build history. The rows mirror the real ones: issue numbers and
  `nextIssueNumber`, board and backlog ranks, an event for every change an issue's state implies, comment events, a version that counts the edits. The content is plain data in its own file so it is easy to read and change.
- **It is tested** (`seed-demo.http.test.ts`, 14 tests on real Postgres and real HTTP): login with the published password and the roles' real rights, consecutive issue numbers with the next one ready, distinct ranks,
  no timestamp in the future, a created event per issue and `updated_at` equal to the latest event, notifications pointing at real events, mention tokens naming members, sprint events and non-empty analytics
  for every project, filters that each find something, search finding a seeded issue, idempotency and reset, and the production guard. Three deliberate breaks were each caught (the next issue number left stale made the
  owner's next created issue fail with a 500; an extra unread notification; a future-dated audit row).

## Trade-offs, named

- **A public demo can be changed by whoever logs in** (including its password, and deleting projects as Owner). The reset is the answer; scheduling it is a Phase 9 job. Nothing stops a visitor from changing the demo
  owner's password in the meantime; a guard on the account endpoints for the demo user is a possible follow-up.
- No attachments (files live on disk) and no profile photos (initials show).
- Dates are relative to when it was built, so the data ages: "overdue" grows and old weeks fall out of the 12-week charts until the next `--reset`.
- The data is English text written by hand; a different language would be a second content file.

## Alternatives rejected

- Going through the services and repositories: faithful, but they stamp the current time, so no history for the charts, and each issue would fan out notifications.
- One generic generator (like the old 100 "Demo issue N"): shows nothing a person would recognise and tests no filter well.
- A member-only demo user: safer, but the tour and the demo would miss Members, Audit log and Settings.

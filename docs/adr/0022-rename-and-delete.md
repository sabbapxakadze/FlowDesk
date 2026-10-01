# 0022 — Rename and delete for projects, labels, sprints and issues

Status: Accepted — 2026-10-01. Rename (slice 3A) and delete for issues, labels and
sprints (slice 3B) are built. Delete for projects (slice 3C) is decided here and not
built yet; this ADR is amended with what each build teaches.

## Context

Projects, labels and sprints could be created but never renamed or removed, and
issues could be edited (including their title) but not deleted. The schema shapes
what "delete" can mean: an issue's events, comments, attachment rows, issue-labels
and notifications all `ON DELETE CASCADE` from the issue, and a project cascades to
its issues and sprints. Analytics are computed on read from `issue_events`
(ADR 0009), and uploaded files live on disk outside any cascade.

## Decision

**Rename (built)**
- **Project:** `PATCH /organizations/:id/projects/:projectId`, body `{ name }`.
  Owner or admin (`manage_project`), like creating one. The **key is immutable**:
  it is part of every issue key (`WEB-12`) that people have in links and heads, and
  changing it would silently break all of them. No version column on projects, so
  concurrent renames are last write wins (like editing a comment).
- **Label:** `PATCH /organizations/:id/labels/:labelId`, body `{ name?, color? }`
  (at least one). Any member who can manage issues, like creating one. The
  per-organization unique name still applies (`409 label_name_taken`; keeping your
  own name is fine). Past activity keeps the name the label had then (events hold a
  snapshot), so history is not rewritten.
- **Sprint:** `PATCH /organizations/:id/projects/:projectId/sprints/:sprintId`,
  body `{ version, name }`, any status. Version-checked like start and complete
  (`409` with the current sprint).
- **Tenant safety:** every query is scoped by organization in the query itself, not
  only by the route middleware in front of it (ADR 0004); a test calls the project
  repository directly with the wrong organization to prove it.
- **UI:** a project settings page (`/projects/:id/settings`, Settings link in the
  sidebar for owners and admins only; read-only for everyone else), an
  organization-level Labels page (`/labels`), and an inline Rename on each sprint
  row. The sidebar and page read the role from the member list for showing or
  hiding controls only; the API is what refuses.

**Delete (decided, not built)**
- **Hard delete for issues, labels, sprints and projects, not soft delete.** Soft
  delete would keep history and charts intact, but every query that reads issues
  (list, board, backlog, search, analytics, notifications, labels counts) would need
  a deleted-at filter, and one missed filter shows a "deleted" issue somewhere.
  Hard delete is simple and matches what small trackers do, at a known cost: an
  issue's history goes with it, and charts built from its events lose it.
- **Who may delete:** issue: the reporter, or an owner/admin (mirrors comments).
  Project: owner/admin, with the project name typed to confirm. Label: owner/admin
  (it changes every issue that uses it). Sprint: any member who can manage issues,
  but not while it is active (complete it first); its issues return to the backlog.
- **Files on disk are removed** when an issue or project is deleted (the database
  cascades rows, not files). Deleting a completed sprint removes it from velocity.
- **Open pages:** a deleted issue broadcasts so anyone viewing it is sent back to
  the list.

**Delete, as built in 3B**
- `DELETE` routes for an issue, a label and a sprint, each answering `204`.
- **Issue:** the permission middleware is only the floor (`manage_issue`, which
  keeps viewers out); the service loads the issue and allows the reporter or an
  owner/admin (`403` otherwise). The repository deletes inside one transaction and
  returns the storage keys of the issue's files, who had notifications for it
  (everyone who acted, plus the assignee), and nothing else is left to chance:
  after the commit the service removes the files from disk (best effort, logged on
  failure), broadcasts `issue:deleted` to the issue room and the project room, and
  tells the affected people's bells to refetch (reusing the `notification:created`
  event, whose only effect on the client is a refetch).
- **Open pages:** the detail page is sent to the project list on `issue:deleted`
  (it must not refetch a deleted issue: that is a 404); the board and list refetch.
- **Label:** `manage_project` (owner/admin). Cascades to `issue_labels`.
- **Sprint:** `manage_issue`; an active sprint is refused with `409 sprint_active`
  and the "not active" condition is part of the DELETE statement itself, so a
  sprint started a moment earlier cannot be removed. Issues keep existing
  (`ON DELETE SET NULL`).
- **UI:** a shared inline `ConfirmDelete` (click, read what will be lost, confirm or
  cancel; not `window.confirm`), a "Danger zone" at the bottom of an issue the
  viewer may delete, Delete on label rows for owners/admins, Delete on non-active
  sprint rows.

## Consequences

- No audit row can record "issue deleted": its events cascade with it. A separate
  organization-level audit log would be needed to keep that; not built.
- Renames of projects, labels and sprints write no event either (events belong to
  issues), so there is no trail of who renamed what.
- Other people's open pages show the old project or label name until their next
  refetch; renames do not broadcast.
- Label colour is validated as `#rrggbb`; the native colour picker produces
  lower-case, the API accepts both.

## Alternatives rejected

- **Editable project key.** Breaks every existing issue key reference.
- **Soft delete for issues now.** Correct for history and analytics, but a wide
  query change with a silent failure mode for a small gain at this size.
- **Letting any member delete a project or label.** Both change shared state for
  everyone.

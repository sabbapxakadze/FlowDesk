# 0021 — Issue assignee, and who gets notified

Status: Accepted — 2026-10-01. Extends the recipient rule from Phase 7 slice 3
("event participants": everyone who has acted on an issue, minus whoever caused
the new event). That rule is kept; this adds to it.

## Context

Issues had no owner. Notifications went to "everyone who had already acted on the
issue", so a person responsible for an issue who had not yet commented or edited
heard nothing about it. An assignee is also the first field that points from an
issue to a user inside the same tenant, which raises a safety question a foreign
key cannot answer.

## Decision

- **Column.** `issues.assignee_id`, nullable (null = unassigned), a foreign key to
  `users` with `ON DELETE SET NULL`: deleting a user must not delete issues.
- **Membership is checked in the service, on every assignment.** The assignee must
  be a member of the issue's organization. A foreign key cannot express that (the
  link runs through `organization_members`), and the id arrives from the client, so
  without the check anyone could assign a user from another organization (and so
  expose that user's name through the event payload). The service looks the member
  up (`findMember(organizationId, userId)`); a miss is `400 invalid_assignee` and
  nothing is changed.
- **Set through the existing PATCH.** `assigneeId` is optional in the version-checked
  update (a uuid, or `null` to unassign). One concurrency story, one event type.
- **The event records the name too.** `issue.updated` carries `assigneeId` and
  `assigneeName` (a snapshot, `null` when unassigning), like label events carry the
  label name: the timeline should say who it was then, even if the person is later
  renamed.
- **Lists carry the id only.** The issue contract has `assigneeId`, not a name, so
  list, board and backlog queries need no user join. The web app resolves names
  from `GET /organizations/:id/members`, fetched once and shared by every card.
- **Members endpoint.** `GET /organizations/:organizationId/members` returns
  `userId`, `name`, `email`, `role`; any member of the organization may call it
  (`requireOrgMembership` keeps other organizations out). It starts a real
  `organizations` module (routes, controller, service on top of the repository that
  already existed).
- **Filter.** `?assignee=` takes a user id or `unassigned`. "Assigned to me" is the
  client sending its own id, so the server needs no special case.
- **Notification recipients = past participants plus the current assignee**, minus
  the actor. The assignee is read from the issue row as updated in the same
  transaction, so a person who has just been assigned is notified by the very event
  that assigned them. Implemented as one `UNION` in `createForIssueEvent`.

## Consequences

- Someone who is assigned an issue but never touches it now gets every later
  notification for it. That is the intent, and it is also noise if an issue is busy;
  muting or per-issue subscription is not built.
- The previous assignee is NOT notified that they were unassigned unless they had
  acted on the issue (then they are a participant). A small gap, accepted for now.
- There is still no way to remove a member from an organization. When that exists,
  their issues need a decision (leave the id, or clear it); today `SET NULL` only
  covers deleting the user row.
- Names on cards depend on the members request finishing; until then the avatar is
  absent for a moment.
- Notifications for issues in other organizations are unaffected: recipients still
  come only from this issue's events and this issue's assignee, and assignees are
  validated as members.

## Alternatives rejected

- **Replace the participant rule with "assignee only".** Would silence commenters
  and the reporter, a regression for every issue without an assignee.
- **Join the user's name into every issue query.** Adds a join to the board and
  backlog queries (unpaginated) for something the member list gives for free.
- **Enforce membership with a composite foreign key.** Would need
  `organization_id` and `assignee_id` to reference `organization_members` together;
  possible, but it makes unassigning and the existing denormalized `organization_id`
  more awkward, and the service check is needed for a clean 400 anyway.
- **A separate assign endpoint.** Two concurrency paths for one row.

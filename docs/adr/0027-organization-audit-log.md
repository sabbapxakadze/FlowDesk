# 0027 — The organization audit log

Status: Accepted — 2026-10-03.

## Context

Issue-level history already exists (`issue_events`, ADR 0005) and is shown on each issue. It cannot
cover what the organization itself does: deleting an issue deletes its whole timeline with it
(`ON DELETE CASCADE`); deleting a project, label or sprint, renaming them, and everything about
membership (invites, roles, removals) left no trace at all. With teams now able to join the
organization, "who deleted that?" and "who removed Second Member?" had no answer.

## Decision

- **An `audit_events` table** (migration 0021): organization, actor id and name, an action
  (`project.renamed`, `member.removed`, ...), a target type and label, a `details` JSON of before
  and after values, and the time. Index `(organization_id, created_at, id)` for the one read
  pattern, newest first.
- **Snapshots, not foreign keys.** The actor's name and the target's name, title or email are
  copied into the row. The point is that the log still makes sense after the project, issue,
  label or sprint is gone, and after a person is renamed. Only the organization is a real foreign
  key (the log leaves with the organization and cannot cross tenants); the actor id is
  `ON DELETE SET NULL` so deleting a user never erases what the organization did.
- **Append-only and atomic.** The app has no code path that updates or deletes a row. Each row is
  written by `auditRepository.record(tx, ...)` INSIDE the same transaction as the action, so an
  action cannot succeed without its row and a row cannot exist for an action that failed (both
  directions are tested with database triggers that force a failure). Actions that were single
  statements (label update and delete, sprint start, rename and delete, project create and rename)
  became small transactions. Where the thing is about to vanish (project, issue, label, sprint
  delete) the row is written BEFORE the delete, with the name and size at that moment.
- **What is recorded (16 actions):** project created, renamed, deleted (with its issue count);
  label updated (only the fields that changed, old and new) and deleted (with how many issues had
  it); sprint renamed, started, completed (with how many issues went back to the backlog) and
  deleted; issue deleted (key, title, project); member invited, invitation re-sent and revoked,
  member joined (also when invited back after removal), role changed (from, to), removed (with how
  many issues became unassigned). A no-op (renaming to the same name, setting the same role) is not
  recorded.
- **What is not recorded, on purpose:** creating labels and sprints (routine noise), ordinary issue
  edits and comments (already on the issue timeline), and security events such as logins, failed
  logins and password resets (a separate, more sensitive topic with its own volume).
- **Reading:** `GET /organizations/:id/audit-events` with a keyset cursor like the issue list, and
  filters `actor` and `kind` (project, label, sprint, issue, member; invitations count as member).
  New permission `view_audit_log` for owners and admins only; members and viewers get 403.
  The page `/audit-log` (sidebar link for owners and admins only) turns each row into a plain
  sentence written from the row alone (`describeAuditEvent`), with the same coloured icon families
  as the issue activity lines. Filters live in the URL.
- **Actors are required.** Every repository function that records takes the actor's id (the
  controllers pass `req.ctx.userId`), so "who" can never be forgotten; the existing tests that
  called those functions directly now pass a real user.

## Consequences

- Rows are kept forever for now. There is no retention limit, no export and no deletion.
- Nothing in the log is encrypted or redacted: emails of invited people are stored in plain text, as
  they already are in `invitations`.
- A row whose `action` this version does not know makes the list endpoint fail loudly rather than
  show something wrong (the contract parses it). Adding an action means adding it to the shared list.
- It records what the server did, not what the person intended; a request that fails validation
  records nothing.
- Existing data starts empty: actions before this slice are not reconstructed.

## Alternatives rejected

- **Reusing `issue_events`:** it is keyed to an issue and cascades away with it.
- **Writing the audit row from the service after the repository call:** simpler, but not atomic; a
  crash between the two would lose the row or record a failed action.
- **Foreign keys to the targets:** they would have to cascade (losing the log) or block the delete.
- **A generic database trigger audit:** records every column change but not who or why, and cannot
  produce readable sentences.

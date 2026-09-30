# 0019 — Comments: edit, delete, files, with an append-only history

Status: Accepted — 2026-09-30. Builds on the audit rule in `CLAUDE.md` (history is
append-only, notifications and analytics read `issue_events`); nothing earlier is
superseded.

## Context

Comments could be posted and listed but not changed, files could not be attached
to a comment, and the timeline showed no times. Two rules pull against each
other: a comment must be editable and deletable, but `issue_events` is an
append-only audit log that is never patched.

## Decision

- **History stays append-only.** An edit appends `issue.comment_edited
  { commentId, body }`; a delete appends `issue.comment_deleted { commentId }`.
  No event row is ever changed.
- **The `comments` row is the read model.** An edit updates `body` and
  `updated_at`; a delete removes the row. `listEvents` LEFT JOINs `comments` onto
  each `issue.commented` event and the service folds it: the current text,
  `edited` (`updated_at` later than `created_at`), `deleted` (the row is gone, so
  the text is blanked), and `canEdit` / `canDelete` computed for the viewer. The
  edit and delete events are not returned as timeline lines.
- **Who may do what.** Edit: the author. Delete: the author, or an owner or admin.
  Both also need `manage_issue`, so a viewer who once wrote a comment cannot
  change it. The service decides this against the real row; the route middleware
  is only the floor. The API sends the per-viewer flags so the web app has no
  role logic.
- **Quiet changes.** Edits and deletes notify nobody: `writeIssueEvent` takes a
  `notify` option (default true) and they pass `false`. Open issue pages still
  refresh through `issue:commented`.
- **Files.** `attachments.comment_id` is nullable, `ON DELETE SET NULL`. The
  upload endpoint takes an optional multipart text field `commentId`, which must
  be a comment on this issue written by the uploader (404 or 403 otherwise),
  checked before anything is written to disk. A comment file writes no
  `attachment_added` event and no notification: it belongs to a comment that
  already notified. A comment's files also show in the issue's Attachments list
  ("from a comment"); a direct upload has `comment_id` null and never appears in a
  comment.
- **Deleting a comment keeps its files.** `SET NULL` makes them ordinary issue
  attachments with no extra code.
- **Post, then upload.** The web app creates the comment, then uploads each file
  with its `commentId`. A failed upload leaves the comment posted and names the
  file; it never loses the typed text.
- **Times.** Relative ("5 minutes ago") in a `<time>` element, exact date on hover.

## Consequences

- The original text of a deleted comment (and every earlier version of an edited
  one) still exists in stored event payloads. It is hidden, never served after the
  edit or delete, not erased. Real erasure (for example a legal request) would
  need a separate, explicit scrub of those payloads.
- Two people editing the same comment: last write wins. Comments have no
  `version` column; only the author can edit, so a clash means one person in two
  tabs.
- The timeline query gains a join, and every comment now needs a matching row;
  both hold because comment creation inserts the row and the event in one
  transaction.
- Not in this decision: mentions, markdown, reactions, threads, an edit-history
  view.

## Alternatives rejected

- **Soft delete (a `deleted_at` column).** Keeps the text in the read model and
  makes "never serve it" a filter every query must remember.
- **Patch the original `issue.commented` event.** Breaks the append-only rule and
  the analytics and notifications that read it.
- **Delete a comment's files with it.** A delete should not silently destroy
  uploads; the owner chose to keep them.
- **One combined multipart request (comment + files).** One partial-failure mode
  instead of a clear per-file message, and it would need a second write path.
- **Notify on edit.** Edits are frequent and low-signal; only new comments notify.

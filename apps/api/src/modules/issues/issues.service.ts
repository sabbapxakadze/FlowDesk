import { randomUUID } from "node:crypto";
import type { IssuePriority, IssueStatus } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import { hasPermission, type Role } from "../../shared/permissions.js";
import {
  broadcastIssueChanged,
  broadcastIssueCommented,
  broadcastNotificationCreated,
} from "../../realtime/socket-server.js";
import * as storage from "../../lib/storage.js";
import * as issuesRepository from "./issues.repository.js";

function broadcastNotifications(notifiedUserIds: string[]): void {
  for (const userId of notifiedUserIds) broadcastNotificationCreated(userId);
}

/**
 * Was a pure pass-through until Phase 6 slice 1 — this is where business
 * rules land once there are any, kept as a real layer from the start so
 * that doesn't mean threading logic into the controller or repository
 * later. create/update/move call broadcastIssueChanged() after the
 * repository call resolves (genuinely "after commit" — db.transaction()
 * has already resolved by then), and only on a real success: update/move
 * check the repository's own discriminated-union status first, since a
 * conflict/not_found never actually changed anything worth broadcasting.
 */
export async function listIssues(
  organizationId: string,
  projectId: string,
  options: {
    limit: number;
    cursor?: string;
    status?: IssueStatus;
    priority?: IssuePriority;
    order: "asc" | "desc";
  },
) {
  return issuesRepository.listByProject(organizationId, projectId, options);
}

export async function getIssue(organizationId: string, projectId: string, issueId: string) {
  return issuesRepository.findById(organizationId, projectId, issueId);
}

export async function createIssue(input: {
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  reporterId: string;
}) {
  const issue = await issuesRepository.create(input);
  broadcastIssueChanged(input.projectId, issue.id);
  return issue;
}

export async function updateIssue(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  changes: Partial<{
    title: string;
    description: string | null;
    status: IssueStatus;
    priority: IssuePriority;
  }>;
  actorId: string;
}) {
  const result = await issuesRepository.update(input);
  if (result.status === "updated") {
    broadcastIssueChanged(input.projectId, input.issueId);
    broadcastNotifications(result.notifiedUserIds);
  }
  return result;
}

export async function listIssueLabels(organizationId: string, issueId: string) {
  return issuesRepository.listLabelsForIssue(organizationId, issueId);
}

// See the matching comment in labels.service.ts: this drizzle-orm version
// wraps the raw pg error in a DrizzleQueryError, code/constraint live on
// err.cause, not the top-level error.
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const cause =
    typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505" &&
    (cause as { constraint?: unknown }).constraint === constraint
  );
}

export async function attachLabel(input: {
  organizationId: string;
  issueId: string;
  labelId: string;
  actorId: string;
}) {
  try {
    const result = await issuesRepository.attachLabel(input);
    if (result.status === "attached") broadcastNotifications(result.notifiedUserIds);
    return result;
  } catch (err) {
    if (isUniqueViolation(err, "issue_labels_issue_id_label_id_pk")) {
      throw new AppError("label_already_attached", 409, "This label is already attached to the issue.");
    }
    throw err;
  }
}

export async function detachLabel(input: {
  organizationId: string;
  issueId: string;
  labelId: string;
  actorId: string;
}) {
  const result = await issuesRepository.detachLabel(input);
  if (result.status === "detached") broadcastNotifications(result.notifiedUserIds);
  return result;
}

export async function addComment(input: { issueId: string; authorId: string; body: string }) {
  const { comment, notifiedUserIds } = await issuesRepository.addComment(input);
  broadcastIssueCommented(input.issueId);
  broadcastNotifications(notifiedUserIds);
  return comment;
}

/**
 * The timeline as the viewer should see it. The repository returns raw rows
 * with each comment's CURRENT row joined on; this folds that into the
 * issue.commented events: the current text (edits applied), `edited`,
 * `deleted` (row gone: text blanked, the original never leaves the server),
 * and whether THIS viewer may edit or delete it, so the client needs no role
 * logic. Edit: the author. Delete: the author, or an owner/admin. Both need
 * manage_issue (a viewer who once wrote a comment can no longer change it).
 */
export async function listIssueEvents(
  organizationId: string,
  issueId: string,
  viewer: { userId: string; role: Role },
) {
  const rows = await issuesRepository.listEvents(organizationId, issueId);
  const canManage = hasPermission(viewer.role, "manage_issue");
  const isAdmin = viewer.role === "owner" || viewer.role === "admin";

  return rows.map((row) => {
    const {
      commentRowId,
      commentBody,
      commentCreatedAt,
      commentUpdatedAt,
      ...event
    } = row;
    if (event.type !== "issue.commented") return event;

    const deleted = commentRowId === null;
    const isAuthor = event.actorId === viewer.userId;
    return {
      ...event,
      payload: {
        // payload is free-form jsonb (unknown); issue.commented always carries commentId.
        commentId: (event.payload as { commentId?: string }).commentId,
        body: deleted ? "" : (commentBody ?? ""),
        edited: !deleted && commentUpdatedAt !== null && commentCreatedAt !== null && commentUpdatedAt > commentCreatedAt,
        deleted,
        canEdit: !deleted && canManage && isAuthor,
        canDelete: !deleted && canManage && (isAuthor || isAdmin),
      },
    };
  });
}

/**
 * Edit: the author only. The decision lives here, not in the repository
 * (which stays logic-free). Quiet by design: no notifications, but open issue
 * pages are told to refresh.
 */
export async function editComment(input: {
  organizationId: string;
  issueId: string;
  commentId: string;
  actorId: string;
  body: string;
}) {
  const comment = await issuesRepository.findComment(input.organizationId, input.issueId, input.commentId);
  if (!comment) return { status: "not_found" } as const;
  if (comment.authorId !== input.actorId) return { status: "forbidden" } as const;

  const updated = await issuesRepository.updateComment({
    issueId: input.issueId,
    commentId: input.commentId,
    actorId: input.actorId,
    body: input.body,
  });
  broadcastIssueCommented(input.issueId);
  return { status: "edited", comment: updated } as const;
}

/** Delete: the author, or an owner/admin. Files on the comment are kept. */
export async function removeComment(input: {
  organizationId: string;
  issueId: string;
  commentId: string;
  actorId: string;
  actorRole: Role;
}) {
  const comment = await issuesRepository.findComment(input.organizationId, input.issueId, input.commentId);
  if (!comment) return { status: "not_found" } as const;
  const isAdmin = input.actorRole === "owner" || input.actorRole === "admin";
  if (comment.authorId !== input.actorId && !isAdmin) return { status: "forbidden" } as const;

  const deleted = await issuesRepository.deleteComment({
    issueId: input.issueId,
    commentId: input.commentId,
    actorId: input.actorId,
  });
  if (!deleted) return { status: "not_found" } as const;
  broadcastIssueCommented(input.issueId);
  return { status: "deleted" } as const;
}

export async function getBoard(organizationId: string, projectId: string) {
  return issuesRepository.listForBoard(organizationId, projectId);
}

export async function moveIssue(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  status: IssueStatus;
  prevIssueId?: string;
  nextIssueId?: string;
  actorId: string;
}) {
  const result = await issuesRepository.move(input);
  if (result.status === "moved") {
    broadcastIssueChanged(input.projectId, input.issueId);
    broadcastNotifications(result.notifiedUserIds);
  }
  return result;
}

export async function getBacklog(organizationId: string, projectId: string) {
  return issuesRepository.getBacklog(organizationId, projectId);
}

export async function assignSprint(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  sprintId: string | null;
  actorId: string;
}) {
  const result = await issuesRepository.assignSprint(input);
  if (result.status === "assigned") broadcastNotifications(result.notifiedUserIds);
  return result;
}

export async function searchIssues(organizationId: string, query: string, limit: number) {
  return issuesRepository.search(organizationId, query, limit);
}

export async function listAttachments(organizationId: string, issueId: string) {
  return issuesRepository.listAttachmentsForIssue(organizationId, issueId);
}

/**
 * The id is generated here, not left to the DB — lib/storage.ts's flat
 * {attachmentId} filenames mean the file needs a name before it's
 * written to disk, and the disk write needs to happen (and succeed)
 * before the DB row is created, so a failed upload never leaves a
 * dangling row pointing at a file that was never saved. See the Phase
 * 7 slice 4 plan.
 */
export async function uploadAttachment(input: {
  organizationId: string;
  issueId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  /** Attach the file to this comment (must be the uploader's own, on this issue). */
  commentId?: string;
}) {
  // Validated BEFORE anything is written to disk, so a rejected comment id
  // never leaves an orphan file behind.
  if (input.commentId) {
    const comment = await issuesRepository.findComment(input.organizationId, input.issueId, input.commentId);
    if (!comment) return { status: "comment_not_found" } as const;
    if (comment.authorId !== input.uploaderId) return { status: "comment_forbidden" } as const;
  }

  const id = randomUUID();
  const storageKey = await storage.saveFile(id, input.buffer);

  const { attachment, notifiedUserIds } = await issuesRepository.addAttachment({
    id,
    issueId: input.issueId,
    uploaderId: input.uploaderId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    storageKey,
    commentId: input.commentId ?? null,
  });

  broadcastNotifications(notifiedUserIds);
  // A comment's file arrives after the comment itself: tell open pages to
  // refetch so it shows up without a reload.
  if (input.commentId) broadcastIssueCommented(input.issueId);
  return { status: "uploaded", attachment } as const;
}

export async function deleteAttachment(input: {
  organizationId: string;
  issueId: string;
  attachmentId: string;
  actorId: string;
}) {
  const result = await issuesRepository.deleteAttachment(input);
  if (result.status === "deleted") {
    broadcastNotifications(result.notifiedUserIds);
    await storage.deleteFile(result.storageKey);
  }
  return result;
}

export async function getAttachmentForDownload(attachmentId: string) {
  return issuesRepository.findAttachmentForDownload(attachmentId);
}

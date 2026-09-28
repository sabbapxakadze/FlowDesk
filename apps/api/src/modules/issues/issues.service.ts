import type { IssueStatus } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import {
  broadcastIssueChanged,
  broadcastIssueCommented,
  broadcastNotificationCreated,
} from "../../realtime/socket-server.js";
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
  options: { limit: number; cursor?: string; status?: IssueStatus; order: "asc" | "desc" },
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
  changes: Partial<{ title: string; description: string | null; status: IssueStatus }>;
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

export async function listIssueEvents(organizationId: string, issueId: string) {
  return issuesRepository.listEvents(organizationId, issueId);
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

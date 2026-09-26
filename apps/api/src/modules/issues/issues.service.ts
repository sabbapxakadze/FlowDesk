import type { IssueStatus } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as issuesRepository from "./issues.repository.js";

/**
 * Pass-through today — same as projects.service.ts. This is where
 * business rules land once there are any, kept as a real layer from the
 * start so that doesn't mean threading logic into the controller or
 * repository later.
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
  return issuesRepository.create(input);
}

export async function updateIssue(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  changes: Partial<{ title: string; description: string | null; status: IssueStatus }>;
  actorId: string;
}) {
  return issuesRepository.update(input);
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
    return await issuesRepository.attachLabel(input);
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
  return issuesRepository.detachLabel(input);
}

export async function addComment(input: { issueId: string; authorId: string; body: string }) {
  return issuesRepository.addComment(input);
}

export async function listIssueEvents(organizationId: string, issueId: string) {
  return issuesRepository.listEvents(organizationId, issueId);
}

export async function getBoard(organizationId: string, projectId: string) {
  return issuesRepository.listForBoard(organizationId, projectId);
}

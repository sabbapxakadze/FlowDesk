import { AppError } from "../../shared/errors.js";
import * as storage from "../../lib/storage.js";
import {
  broadcastNotificationCreated,
  broadcastOrganizationChanged,
  broadcastProjectDeleted,
} from "../../realtime/socket-server.js";
import * as projectsRepository from "./projects.repository.js";

/**
 * Pass-through today — this is where business rules land once there are
 * any (e.g. "don't list archived projects"). Kept as a real layer from the
 * start so adding a rule later doesn't mean threading logic into the
 * controller or repository.
 */
export async function listProjects(organizationId: string) {
  return projectsRepository.listByOrganization(organizationId);
}

// This drizzle-orm version wraps the raw pg error in a DrizzleQueryError —
// code/constraint live on err.cause, not the top-level error. The
// original top-level check here never actually matched (confirmed by
// forcing a real duplicate-key insert and inspecting the error shape
// while building Phase 3 slice 3's identical label-uniqueness check) —
// a duplicate project key silently fell through to a raw 500 instead of
// the intended 409. Fixed here and in labels.service.ts / issues.service.ts.
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

export async function createProject(input: { organizationId: string; name: string; key: string; actorId: string }) {
  try {
    // Uppercased here, not in the contract schema — the contract's job is
    // shape (2-10 alphanumeric chars), casing is a business rule.
    return await projectsRepository.create({ ...input, key: input.key.toUpperCase() });
  } catch (err) {
    if (isUniqueViolation(err, "projects_organization_id_key_unique")) {
      throw new AppError(
        "project_key_taken",
        409,
        "A project with this key already exists in this organization.",
      );
    }
    throw err;
  }
}

export async function renameProject(input: {
  organizationId: string;
  projectId: string;
  name: string;
  actorId: string;
}) {
  const project = await projectsRepository.updateName(
    input.organizationId,
    input.projectId,
    input.name,
    input.actorId,
  );
  // Open tabs (the sidebar, titles) refetch the project list.
  if (project) broadcastOrganizationChanged(input.organizationId, { kind: "project" });
  return project;
}

/**
 * Delete a project. The caller's role is already checked by the route
 * (manage_project: owner/admin). Here: the typed name must match exactly, then
 * after the database has committed the uploaded files are removed from disk
 * (best effort, logged), the organization is told so sidebars and open pages
 * drop the project, and everyone who had notifications for its issues refetches
 * their bell (those notifications went with the issues).
 */
export async function deleteProject(input: {
  organizationId: string;
  projectId: string;
  confirmName: string;
  actorId: string;
}) {
  const project = await projectsRepository.findById(input.organizationId, input.projectId);
  if (!project) return { status: "not_found" } as const;
  if (input.confirmName !== project.name) return { status: "confirmation_mismatch" } as const;

  const result = await projectsRepository.remove({
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorId: input.actorId,
  });
  if (result.status === "not_found") return result;

  for (const storageKey of result.storageKeys) {
    await storage.deleteFile(storageKey);
  }
  broadcastProjectDeleted(input.organizationId, input.projectId);
  // The event name says "created" but the client's reaction is simply to refetch
  // its notification list and unread count, which is what is needed.
  for (const userId of result.affectedUserIds) broadcastNotificationCreated(userId);
  return { status: "deleted" } as const;
}

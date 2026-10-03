import { AppError } from "../../shared/errors.js";
import { broadcastNotificationCreated, broadcastOrganizationChanged } from "../../realtime/socket-server.js";
import * as sprintsRepository from "./sprints.repository.js";

export async function listSprints(organizationId: string, projectId: string) {
  return sprintsRepository.listByProject(organizationId, projectId);
}

export async function createSprint(input: {
  organizationId: string;
  projectId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}) {
  return sprintsRepository.create(input);
}

// Same shape as labels.service.ts's/issues.service.ts's isUniqueViolation:
// this drizzle-orm version wraps the raw pg error in a DrizzleQueryError,
// code/constraint live on err.cause, not the top-level error.
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

export async function startSprint(input: {
  organizationId: string;
  projectId: string;
  sprintId: string;
  expectedVersion: number;
  actorId: string;
}) {
  try {
    return await sprintsRepository.start(input);
  } catch (err) {
    if (isUniqueViolation(err, "sprints_project_id_active_unique")) {
      throw new AppError(
        "sprint_already_active",
        409,
        "Another sprint is already active in this project — complete it first.",
      );
    }
    throw err;
  }
}

export async function completeSprint(input: {
  organizationId: string;
  projectId: string;
  sprintId: string;
  expectedVersion: number;
  actorId: string;
}) {
  const result = await sprintsRepository.complete(input);
  if (result.status === "completed") {
    for (const userId of result.notifiedUserIds) broadcastNotificationCreated(userId);
  }
  return result;
}

export async function renameSprint(input: {
  organizationId: string;
  projectId: string;
  sprintId: string;
  expectedVersion: number;
  name: string;
  actorId: string;
}) {
  const result = await sprintsRepository.rename(input);
  if (result.status === "renamed") {
    broadcastOrganizationChanged(input.organizationId, { kind: "sprint", projectId: input.projectId });
  }
  return result;
}

export async function deleteSprint(input: {
  organizationId: string;
  projectId: string;
  sprintId: string;
  actorId: string;
}) {
  const result = await sprintsRepository.remove(input);
  if (result.status === "deleted") {
    broadcastOrganizationChanged(input.organizationId, { kind: "sprint", projectId: input.projectId });
  }
  return result;
}

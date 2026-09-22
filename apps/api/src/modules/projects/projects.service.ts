import { AppError } from "../../shared/errors.js";
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

function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "23505" &&
    (err as { constraint?: unknown }).constraint === constraint
  );
}

export async function createProject(input: { organizationId: string; name: string; key: string }) {
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

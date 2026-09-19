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

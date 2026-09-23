import * as issuesRepository from "./issues.repository.js";

/**
 * Pass-through today — same as projects.service.ts. This is where
 * business rules land once there are any (e.g. slice 2's version-conflict
 * handling), kept as a real layer from the start so that doesn't mean
 * threading logic into the controller or repository later.
 */
export async function listIssues(organizationId: string, projectId: string) {
  return issuesRepository.listByProject(organizationId, projectId);
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

import { projectKeys } from "../../project";

/**
 * Extends projectKeys.all rather than starting a fresh base array —
 * issues are nested under a project the same way the URL nests them,
 * so invalidating "all projects" data could reasonably cascade to issues
 * too. Same factory shape as entities/project/api/queryKeys.ts.
 */
export const issueKeys = {
  all: [...projectKeys.all, "issues"] as const,
  list: (projectId: string) => [...issueKeys.all, projectId] as const,
  labels: (issueId: string) => [...issueKeys.all, issueId, "labels"] as const,
};

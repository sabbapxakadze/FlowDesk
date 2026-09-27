import { projectKeys } from "../../project";

/**
 * Same factory shape as entities/issue/api/queryKeys.ts — extends
 * projectKeys.all rather than starting a fresh base array, since sprints
 * are nested under a project the same way the URL nests them.
 */
export const sprintKeys = {
  all: [...projectKeys.all, "sprints"] as const,
  list: (projectId: string) => [...sprintKeys.all, projectId] as const,
};

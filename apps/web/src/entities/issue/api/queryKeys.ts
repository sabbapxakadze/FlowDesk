import type { IssueStatus } from "@flowdesk/contracts";
import { projectKeys } from "../../project";

export type IssueListFilters = { status?: IssueStatus; order?: "asc" | "desc" };

/**
 * Extends projectKeys.all rather than starting a fresh base array —
 * issues are nested under a project the same way the URL nests them,
 * so invalidating "all projects" data could reasonably cascade to issues
 * too. Same factory shape as entities/project/api/queryKeys.ts.
 *
 * list() takes an optional filters object — WITH filters, it's a distinct
 * cache entry per status/order combination (useIssues passes these so a
 * filtered view doesn't show another filter's cached pages). WITHOUT
 * filters, it returns the plain [..., projectId] key, which is a *prefix*
 * of every filtered variant's key — so existing
 * invalidateQueries({ queryKey: issueKeys.list(projectId) }) calls
 * (CreateIssueForm, EditIssueForm) keep invalidating every filtered
 * variant via TanStack's partial key matching, with no changes needed
 * there.
 */
export const issueKeys = {
  all: [...projectKeys.all, "issues"] as const,
  list: (projectId: string, filters?: IssueListFilters) =>
    filters ? ([...issueKeys.all, projectId, filters] as const) : ([...issueKeys.all, projectId] as const),
  // [...all, projectId, "board"] — [...all, projectId] (list() with no
  // filters) is still a prefix of this, so CreateIssueForm/EditIssueForm's
  // existing invalidateQueries({ queryKey: issueKeys.list(projectId) })
  // calls already invalidate the board too, same reasoning as list()'s
  // filtered variants above. No changes needed in either file.
  board: (projectId: string) => [...issueKeys.all, projectId, "board"] as const,
  detail: (issueId: string) => [...issueKeys.all, issueId] as const,
  labels: (issueId: string) => [...issueKeys.all, issueId, "labels"] as const,
  events: (issueId: string) => [...issueKeys.all, issueId, "events"] as const,
};

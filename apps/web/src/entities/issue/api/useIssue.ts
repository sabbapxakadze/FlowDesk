import { useQuery } from "@tanstack/react-query";
import { fetchIssue } from "./fetchIssue";
import { issueKeys } from "./queryKeys";

/**
 * The dedicated single-issue fetch — replaces IssueDetailPage's earlier
 * shortcut of scanning the (now-paginated) list for a matching id, which
 * stopped being correct once that list only ever returns its first page.
 * See docs/roadmap.md's Phase 4 slice 1 entry.
 */
export function useIssue(organizationId: string, projectId: string, issueId: string) {
  return useQuery({
    queryKey: issueKeys.detail(issueId),
    queryFn: () => fetchIssue(organizationId, projectId, issueId),
  });
}

import { useQuery } from "@tanstack/react-query";
import { fetchIssueLabels } from "./fetchIssueLabels";
import { issueKeys } from "./queryKeys";

/**
 * Not embedded in the issue list response — a dedicated query fetched
 * only while something needs this specific issue's labels (the edit
 * form's label picker), not on every card in the list. See the Phase 3
 * slice 3 plan's "Decisions" section.
 */
export function useIssueLabels(organizationId: string, projectId: string, issueId: string) {
  return useQuery({
    queryKey: issueKeys.labels(issueId),
    queryFn: () => fetchIssueLabels(organizationId, projectId, issueId),
  });
}

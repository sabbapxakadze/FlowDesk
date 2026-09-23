import { useQuery } from "@tanstack/react-query";
import { fetchIssueEvents } from "./fetchIssueEvents";
import { issueKeys } from "./queryKeys";

export function useIssueEvents(organizationId: string, projectId: string, issueId: string) {
  return useQuery({
    queryKey: issueKeys.events(issueId),
    queryFn: () => fetchIssueEvents(organizationId, projectId, issueId),
  });
}

import { useQuery } from "@tanstack/react-query";
import { fetchIssues } from "./fetchIssues";
import { issueKeys } from "./queryKeys";

export function useIssues(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: issueKeys.list(projectId),
    queryFn: () => fetchIssues(organizationId, projectId),
  });
}

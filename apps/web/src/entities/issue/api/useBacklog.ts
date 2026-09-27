import { useQuery } from "@tanstack/react-query";
import { fetchBacklog } from "./fetchBacklog";
import { issueKeys } from "./queryKeys";

export function useBacklog(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: issueKeys.backlog(projectId),
    queryFn: () => fetchBacklog(organizationId, projectId),
  });
}

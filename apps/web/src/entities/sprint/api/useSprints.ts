import { useQuery } from "@tanstack/react-query";
import { fetchSprints } from "./fetchSprints";
import { sprintKeys } from "./queryKeys";

export function useSprints(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: sprintKeys.list(projectId),
    queryFn: () => fetchSprints(organizationId, projectId),
  });
}

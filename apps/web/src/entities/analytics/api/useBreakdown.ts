import { useQuery } from "@tanstack/react-query";
import { fetchBreakdown } from "./fetchBreakdown";
import { analyticsKeys } from "./queryKeys";

export function useBreakdown(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: analyticsKeys.breakdown(projectId),
    queryFn: () => fetchBreakdown(organizationId, projectId),
  });
}

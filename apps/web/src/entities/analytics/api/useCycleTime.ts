import { useQuery } from "@tanstack/react-query";
import { fetchCycleTime } from "./fetchCycleTime";
import { analyticsKeys } from "./queryKeys";

export function useCycleTime(organizationId: string, projectId: string, weeks: number) {
  return useQuery({
    queryKey: analyticsKeys.cycleTime(projectId, weeks),
    queryFn: () => fetchCycleTime(organizationId, projectId, weeks),
  });
}

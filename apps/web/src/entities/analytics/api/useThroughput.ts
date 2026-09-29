import { useQuery } from "@tanstack/react-query";
import { fetchThroughput } from "./fetchThroughput";
import { analyticsKeys } from "./queryKeys";

export function useThroughput(organizationId: string, projectId: string, weeks: number) {
  return useQuery({
    queryKey: analyticsKeys.throughput(projectId, weeks),
    queryFn: () => fetchThroughput(organizationId, projectId, weeks),
  });
}

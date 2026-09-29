import { useQuery } from "@tanstack/react-query";
import { fetchVelocity } from "./fetchVelocity";
import { analyticsKeys } from "./queryKeys";

export function useVelocity(organizationId: string, projectId: string, sprints: number) {
  return useQuery({
    queryKey: analyticsKeys.velocity(projectId, sprints),
    queryFn: () => fetchVelocity(organizationId, projectId, sprints),
  });
}

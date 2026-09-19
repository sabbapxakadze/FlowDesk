import { useQuery } from "@tanstack/react-query";
import { fetchProjects } from "./fetchProjects";
import { projectKeys } from "./queryKeys";

export function useProjects(organizationId: string) {
  return useQuery({
    queryKey: projectKeys.list(organizationId),
    queryFn: () => fetchProjects(organizationId),
  });
}

import { useQuery } from "@tanstack/react-query";
import { fetchAssignedIssues } from "./fetchAssignedIssues";

/** Open issues assigned to the signed-in person, newest change first, with the total. Always re-read when the page opens. */
export function useAssignedIssues(organizationId: string, limit: number) {
  return useQuery({
    queryKey: ["organizations", organizationId, "my-work", limit] as const,
    queryFn: () => fetchAssignedIssues(organizationId, limit),
    enabled: organizationId !== "",
    refetchOnMount: "always",
  });
}

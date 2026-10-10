import { useQuery } from "@tanstack/react-query";
import { fetchAssignedIssues } from "./fetchAssignedIssues";
import { issueKeys } from "./queryKeys";

/** Open issues assigned to the signed-in person, newest change first, with the total. Always re-read when the page opens. */
export function useAssignedIssues(organizationId: string, limit: number) {
  return useQuery({
    queryKey: [...issueKeys.myWork(organizationId), limit] as const,
    queryFn: () => fetchAssignedIssues(organizationId, limit),
    enabled: organizationId !== "",
    refetchOnMount: "always",
  });
}

import { useQuery } from "@tanstack/react-query";
import { fetchWeekProgress } from "./fetchWeekProgress";
import { issueKeys } from "./queryKeys";

/** The week ring's numbers for one Monday-to-Sunday range. Re-read when the page opens, and on every quick action (same key prefix as the assigned list). */
export function useWeekProgress(organizationId: string, from: string, to: string) {
  return useQuery({
    queryKey: [...issueKeys.myWork(organizationId), "week", from, to] as const,
    queryFn: () => fetchWeekProgress(organizationId, from, to),
    enabled: organizationId !== "",
    refetchOnMount: "always",
  });
}

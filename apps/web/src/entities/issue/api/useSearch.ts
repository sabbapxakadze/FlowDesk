import { useQuery } from "@tanstack/react-query";
import { fetchSearch } from "./fetchSearch";
import { issueKeys } from "./queryKeys";

/** enabled guards against firing on an empty/whitespace query — the API
 * would just reject it anyway (searchIssuesQuerySchema requires min(1)
 * after trim), no point round-tripping to find that out. */
export function useSearch(organizationId: string, query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: issueKeys.search(organizationId, trimmed),
    queryFn: () => fetchSearch(organizationId, trimmed),
    enabled: trimmed.length > 0,
  });
}

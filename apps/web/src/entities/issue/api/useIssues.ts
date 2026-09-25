import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchIssues } from "./fetchIssues";
import { issueKeys } from "./queryKeys";

/**
 * Cursor pagination via TanStack Query's built-in useInfiniteQuery, not a
 * hand-rolled "page" state: getNextPageParam reads the server's opaque
 * nextCursor directly, and a null nextCursor is what tells TanStack there's
 * no further page — no separate hasMore bookkeeping needed on this side.
 * Same queryKey factory (issueKeys.list) useQuery used; useInfiniteQuery
 * namespaces its cache under it automatically.
 */
export function useIssues(organizationId: string, projectId: string) {
  return useInfiniteQuery({
    queryKey: issueKeys.list(projectId),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchIssues(organizationId, projectId, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

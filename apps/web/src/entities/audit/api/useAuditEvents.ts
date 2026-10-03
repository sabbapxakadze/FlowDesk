import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchAuditEvents } from "./fetchAuditEvents";
import { auditKeys, type AuditFilters } from "./queryKeys";

/**
 * Cursor pagination like the issue list. Only owners and admins may read the log (the API answers
 * 403 to anyone else), so callers pass `enabled: false` for other roles instead of firing a
 * request that is certain to fail.
 */
export function useAuditEvents(organizationId: string, filters: AuditFilters = {}, options: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: auditKeys.list(organizationId, filters),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchAuditEvents(organizationId, { ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options.enabled ?? true,
  });
}

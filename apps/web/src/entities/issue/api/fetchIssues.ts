import { listIssuesResponseSchema } from "@flowdesk/contracts";
import { apiGet } from "../../../shared/api/client";
import type { IssueListFilters } from "./queryKeys";

/** cursor is opaque and server-generated (see issues.repository.ts) — this
 * function only ever round-trips one a previous page handed back, via
 * useIssues' useInfiniteQuery pageParam. status/order are the URL-driven
 * filter/sort state (see ProjectDetailPage). */
export function fetchIssues(
  organizationId: string,
  projectId: string,
  { cursor, status, order }: IssueListFilters & { cursor?: string } = {},
) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (status) params.set("status", status);
  if (order) params.set("order", order);
  const query = params.size > 0 ? `?${params.toString()}` : "";

  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues${query}`,
    listIssuesResponseSchema,
  );
}

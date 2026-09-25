import { listIssuesResponseSchema } from "@flowdesk/contracts";
import { apiGet } from "../../../shared/api/client";

/** cursor is opaque and server-generated (see issues.repository.ts) — this
 * function only ever round-trips one a previous page handed back, via
 * useIssues' useInfiniteQuery pageParam. */
export function fetchIssues(
  organizationId: string,
  projectId: string,
  { cursor }: { cursor?: string } = {},
) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues${query}`,
    listIssuesResponseSchema,
  );
}

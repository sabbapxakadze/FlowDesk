import { listIssuesResponseSchema } from "@flowdesk/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchIssues(organizationId: string, projectId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues`,
    listIssuesResponseSchema,
  ).then((res) => res.data);
}

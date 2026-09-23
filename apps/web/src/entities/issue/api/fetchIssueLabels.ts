import { listLabelsResponseSchema } from "@flowdesk/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchIssueLabels(organizationId: string, projectId: string, issueId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/labels`,
    listLabelsResponseSchema,
  ).then((res) => res.data);
}

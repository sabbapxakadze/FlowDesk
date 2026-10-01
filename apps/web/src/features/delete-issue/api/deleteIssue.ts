import { apiDeleteVoid } from "../../../shared/api/client";

export function deleteIssue(organizationId: string, projectId: string, issueId: string) {
  return apiDeleteVoid(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}`,
  );
}

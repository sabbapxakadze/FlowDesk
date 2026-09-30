import { apiDeleteVoid } from "../../../shared/api/client";

export function deleteComment(organizationId: string, projectId: string, issueId: string, commentId: string) {
  return apiDeleteVoid(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/comments/${commentId}`,
  );
}

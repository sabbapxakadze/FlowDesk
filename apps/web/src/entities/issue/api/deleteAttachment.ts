import { apiDeleteVoid } from "../../../shared/api/client";

export function deleteAttachment(organizationId: string, projectId: string, issueId: string, attachmentId: string) {
  return apiDeleteVoid(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/attachments/${attachmentId}`,
  );
}

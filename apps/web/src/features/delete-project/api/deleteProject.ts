import { apiDeleteVoid } from "../../../shared/api/client";

export function deleteProject(
  organizationId: string,
  projectId: string,
  confirmName: string,
) {
  return apiDeleteVoid(`/v1/organizations/${organizationId}/projects/${projectId}`, {
    confirmName,
  });
}

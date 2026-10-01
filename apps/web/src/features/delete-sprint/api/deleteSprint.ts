import { apiDeleteVoid } from "../../../shared/api/client";

export function deleteSprint(
  organizationId: string,
  projectId: string,
  sprintId: string,
) {
  return apiDeleteVoid(
    `/v1/organizations/${organizationId}/projects/${projectId}/sprints/${sprintId}`,
  );
}

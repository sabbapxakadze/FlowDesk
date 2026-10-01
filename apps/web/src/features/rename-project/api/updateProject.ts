import {
  updateProjectResponseSchema,
  type UpdateProjectRequest,
} from "@flowdesk/contracts";
import { apiPatch } from "../../../shared/api/client";

export function updateProject(
  organizationId: string,
  projectId: string,
  input: UpdateProjectRequest,
) {
  return apiPatch(
    `/v1/organizations/${organizationId}/projects/${projectId}`,
    input,
    updateProjectResponseSchema,
  ).then((res) => res.data);
}

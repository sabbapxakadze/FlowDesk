import { listSprintsResponseSchema } from "@flowdesk/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchSprints(organizationId: string, projectId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/sprints`,
    listSprintsResponseSchema,
  ).then((res) => res.data);
}

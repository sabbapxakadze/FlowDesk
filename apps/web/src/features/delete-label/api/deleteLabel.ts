import { apiDeleteVoid } from "../../../shared/api/client";

export function deleteLabel(organizationId: string, labelId: string) {
  return apiDeleteVoid(`/v1/organizations/${organizationId}/labels/${labelId}`);
}

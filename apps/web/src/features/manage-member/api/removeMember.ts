import { apiDeleteVoid } from "../../../shared/api/client";

export function removeMember(organizationId: string, userId: string) {
  return apiDeleteVoid(`/v1/organizations/${organizationId}/members/${userId}`);
}

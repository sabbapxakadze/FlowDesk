import { apiPatchVoid } from "../../../shared/api/client";

export function changeMemberRole(organizationId: string, userId: string, role: "admin" | "member" | "viewer") {
  return apiPatchVoid(`/v1/organizations/${organizationId}/members/${userId}`, { role });
}

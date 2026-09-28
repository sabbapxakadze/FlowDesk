import { apiPatchVoid } from "../../../shared/api/client";

export function markAllNotificationsRead(organizationId: string) {
  return apiPatchVoid(`/v1/organizations/${organizationId}/notifications/read-all`);
}

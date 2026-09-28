import { apiPatchVoid } from "../../../shared/api/client";

export function markNotificationRead(organizationId: string, notificationId: string) {
  return apiPatchVoid(`/v1/organizations/${organizationId}/notifications/${notificationId}/read`);
}

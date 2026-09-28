import { listNotificationsResponseSchema } from "@flowdesk/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchNotifications(organizationId: string) {
  return apiGet(`/v1/organizations/${organizationId}/notifications`, listNotificationsResponseSchema).then(
    (res) => res.data,
  );
}

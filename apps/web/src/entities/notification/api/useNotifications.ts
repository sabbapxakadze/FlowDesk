import { useQuery } from "@tanstack/react-query";
import { fetchNotifications } from "./fetchNotifications";
import { notificationKeys } from "./queryKeys";

/**
 * enabled guards against firing with an empty organizationId while
 * logged out — NotificationBell is mounted globally (see
 * widgets/notification-bell/), unlike every other useProjects/useIssues
 * caller which only ever renders inside RequireAuth. Same bug class
 * CommandPalette's useProjects call hit in Phase 7 slice 2.
 */
export function useNotifications(organizationId: string) {
  return useQuery({
    queryKey: notificationKeys.list(organizationId),
    queryFn: () => fetchNotifications(organizationId),
    enabled: organizationId !== "",
  });
}

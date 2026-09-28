import { useQuery } from "@tanstack/react-query";
import { fetchUnreadCount } from "./fetchUnreadCount";
import { notificationKeys } from "./queryKeys";

/** Same enabled guard as useNotifications — see its comment. */
export function useUnreadCount(organizationId: string) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(organizationId),
    queryFn: () => fetchUnreadCount(organizationId),
    enabled: organizationId !== "",
  });
}

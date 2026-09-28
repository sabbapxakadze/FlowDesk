import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markAllNotificationsRead } from "./markAllNotificationsRead";
import { notificationKeys } from "./queryKeys";

export function useMarkAllNotificationsRead(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markAllNotificationsRead(organizationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list(organizationId) });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(organizationId) });
    },
  });
}

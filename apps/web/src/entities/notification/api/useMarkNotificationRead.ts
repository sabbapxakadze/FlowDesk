import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markNotificationRead } from "./markNotificationRead";
import { notificationKeys } from "./queryKeys";

export function useMarkNotificationRead(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(organizationId, notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list(organizationId) });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(organizationId) });
    },
  });
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../../shared/socket/socket-client";
import { notificationKeys } from "./queryKeys";

/**
 * No join:* needed here, unlike useLiveIssueUpdates' join:project —
 * user:{userId} is auto-joined server-side on every connect/reconnect
 * (see socket-server.ts), since a user's own notifications are always
 * wanted regardless of what page they're on. This hook only needs to
 * listen and refetch, for the lifetime of whatever mounts it (the
 * globally-mounted NotificationBell) — same "just refetch" precedent
 * useLiveIssueUpdates uses for issue:changed, not a payload to splice
 * into the cache by hand.
 */
export function useLiveNotifications(organizationId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleNotificationCreated() {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list(organizationId) });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(organizationId) });
    }

    socket.on("notification:created", handleNotificationCreated);
    return () => {
      socket.off("notification:created", handleNotificationCreated);
    };
  }, [organizationId, queryClient]);
}

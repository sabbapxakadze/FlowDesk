import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, whenOrgRoomReady } from "../../../shared/socket/socket-client";
import { issueKeys } from "./queryKeys";

/**
 * Joins issue:{id} for the lifetime of the issue detail page, same
 * page-scoped lifecycle as useLiveIssueUpdates' project:{id} join (not
 * connection-scoped like org:{id}) — a different room, and different
 * invalidation targets (detail/events, not board/list), so this is a
 * sibling hook rather than a generalized version of that one.
 *
 * Listens for both issue:changed (a field change from anywhere — the
 * board, another edit) and issue:commented — both end up invalidating
 * the same two queries here, since either one means this issue's own
 * data or its timeline is now stale.
 *
 * Re-joins on every "connect" event, not just on mount — same
 * reconnect-safety reasoning as useLiveIssueUpdates.
 */
export function useLiveIssueDetailUpdates(projectId: string, issueId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    let cancelled = false;

    // Waits for the org room first — same real race useLiveIssueUpdates
    // fixes (see whenOrgRoomReady()'s comment in
    // shared/socket/socket-client.ts), not board-specific.
    function join() {
      void whenOrgRoomReady().then(() => {
        if (cancelled) return;
        socket?.emit("join:issue", { projectId, issueId }, (ack: { ok: boolean; error?: string }) => {
          if (!ack.ok) {
            console.error("Failed to join issue room", ack.error);
          }
        });
      });
    }

    function handleUpdate() {
      void queryClient.invalidateQueries({ queryKey: issueKeys.detail(issueId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(issueId) });
    }

    join();
    socket.on("connect", join);
    socket.on("issue:changed", handleUpdate);
    socket.on("issue:commented", handleUpdate);

    return () => {
      cancelled = true;
      socket.off("connect", join);
      socket.off("issue:changed", handleUpdate);
      socket.off("issue:commented", handleUpdate);
      socket.emit("leave:issue", { issueId });
    };
  }, [projectId, issueId, queryClient]);
}

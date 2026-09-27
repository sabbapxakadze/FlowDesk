import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, whenOrgRoomReady } from "../../../shared/socket/socket-client";
import { issueKeys } from "./queryKeys";

export type PresenceViewer = { userId: string; name: string };

/**
 * Joins issue:{id} for the lifetime of the issue detail page, same
 * page-scoped lifecycle as useLiveIssueUpdates' project:{id} join (not
 * connection-scoped like org:{id}) — a different room, and different
 * invalidation targets (detail/events, not board/list), so this is a
 * sibling hook rather than a generalized version of that one.
 *
 * Listens for issue:changed (a field change from anywhere — the board,
 * another edit) and issue:commented — both invalidate the same two
 * queries, since either one means this issue's own data or its
 * timeline is now stale. Also listens for presence:update (Phase 6
 * slice 4) and returns the current viewer list — ephemeral UI state,
 * not query-cache data, but it arrives on the same room this hook
 * already owns the join/leave lifecycle for, not a reason to duplicate
 * that plumbing in a second hook.
 *
 * Re-joins on every "connect" event, not just on mount — same
 * reconnect-safety reasoning as useLiveIssueUpdates.
 */
export function useLiveIssueDetailUpdates(
  projectId: string,
  issueId: string,
): { viewers: PresenceViewer[] } {
  const queryClient = useQueryClient();
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);

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

    function handlePresenceUpdate(payload: { issueId: string; viewers: PresenceViewer[] }) {
      setViewers(payload.viewers);
    }

    join();
    socket.on("connect", join);
    socket.on("issue:changed", handleUpdate);
    socket.on("issue:commented", handleUpdate);
    socket.on("presence:update", handlePresenceUpdate);

    return () => {
      cancelled = true;
      socket.off("connect", join);
      socket.off("issue:changed", handleUpdate);
      socket.off("issue:commented", handleUpdate);
      socket.off("presence:update", handlePresenceUpdate);
      socket.emit("leave:issue", { issueId });
      // Reset so navigating to a different issue doesn't briefly show
      // this one's viewers before the new room's first update arrives.
      setViewers([]);
    };
  }, [projectId, issueId, queryClient]);

  return { viewers };
}

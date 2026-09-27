import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, whenOrgRoomReady } from "../../../shared/socket/socket-client";
import { issueKeys } from "./queryKeys";

/**
 * Joins project:{id} for the lifetime of the calling page (board or
 * list), not the connection's — a user navigates between projects
 * within the same socket, unlike org:{id} (joined once at login, see
 * shared/socket/socket-client.ts). issue:changed just triggers the same
 * invalidation the mutating client's own onSuccess already does
 * (board/list), not a second fetch path.
 *
 * Re-joins on every "connect" event, not just on mount: if the API
 * restarts while this page is open, connectSocket()'s own reconnect
 * logic already re-establishes org:{id}, but this page-scoped join has
 * no equivalent unless it listens for reconnects itself — otherwise
 * live updates would silently stop working post-reconnect until the
 * user navigates away and back.
 */
export function useLiveIssueUpdates(projectId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    let cancelled = false;

    // Waits for the org room to actually be joined first — see
    // whenOrgRoomReady()'s comment in shared/socket/socket-client.ts for
    // the real race this fixes: on a fresh page load, join:project could
    // otherwise reach the server before join:org's ack had set
    // socket.data.organizationId, and get rejected with not_in_org even
    // though nothing here did anything wrong.
    function join() {
      void whenOrgRoomReady().then(() => {
        if (cancelled) return;
        socket?.emit("join:project", { projectId }, (ack: { ok: boolean; error?: string }) => {
          if (!ack.ok) {
            console.error("Failed to join project room", ack.error);
          }
        });
      });
    }

    function handleIssueChanged() {
      void queryClient.invalidateQueries({ queryKey: issueKeys.board(projectId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
    }

    join();
    socket.on("connect", join);
    socket.on("issue:changed", handleIssueChanged);

    return () => {
      cancelled = true;
      socket.off("connect", join);
      socket.off("issue:changed", handleIssueChanged);
      socket.emit("leave:project", { projectId });
    };
  }, [projectId, queryClient]);
}

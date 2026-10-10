import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, whenOrgRoomReady } from "../../../shared/socket/socket-client";
import { issueKeys } from "./queryKeys";

/**
 * Keeps the My work page current. The page spans projects, so it joins the room of EVERY project it is given (a change to an issue that is
 * newly assigned to me, finished, renamed or re-dated happens in some project's room) and, on any issue change or deletion, re-reads the whole
 * page (`issueKeys.myWork`: the assigned list and the week ring). A deleted project (an organization-wide event) does the same. Your own edits
 * come back the same way, because the server broadcasts to everyone in the room, the editor included.
 *
 * Joins again on every "connect" (the API restarting must not silently end live updates) and leaves each room when the page goes away, the
 * same shape as `useLiveIssueUpdates`, which does this for one project.
 */
export function useLiveMyWork(organizationId: string, projectIds: string[]): void {
  const queryClient = useQueryClient();
  const joined = projectIds.join(",");

  useEffect(() => {
    const socket = getSocket();
    const ids = joined === "" ? [] : joined.split(",");
    if (!socket || ids.length === 0) return;

    let cancelled = false;

    function join() {
      void whenOrgRoomReady().then(() => {
        if (cancelled) return;
        for (const projectId of ids) {
          socket?.emit("join:project", { projectId }, (ack: { ok: boolean; error?: string }) => {
            if (!ack.ok) console.error("Failed to join project room", ack.error);
          });
        }
      });
    }

    function refresh() {
      void queryClient.invalidateQueries({ queryKey: issueKeys.myWork(organizationId) });
    }

    join();
    socket.on("connect", join);
    socket.on("issue:changed", refresh);
    socket.on("issue:deleted", refresh);
    socket.on("project:deleted", refresh);

    return () => {
      cancelled = true;
      socket.off("connect", join);
      socket.off("issue:changed", refresh);
      socket.off("issue:deleted", refresh);
      socket.off("project:deleted", refresh);
      for (const projectId of ids) socket.emit("leave:project", { projectId });
    };
  }, [organizationId, joined, queryClient]);
}

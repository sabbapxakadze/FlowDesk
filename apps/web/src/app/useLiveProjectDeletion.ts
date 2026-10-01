import { useEffect } from "react";
import { useMatch, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "../entities/project";
import { getSocket } from "../shared/socket/socket-client";

/**
 * Listens on the organization room (every connected member is in it) for
 * project:deleted (ADR 0022). Everyone refetches the project list, so the
 * sidebar and the projects page drop it; anyone currently on a page of the
 * deleted project is sent to the projects list instead of being left on pages
 * that would now fail. Mounted once, in the app shell.
 */
export function useLiveProjectDeletion(organizationId: string): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentProjectId = useMatch("/projects/:projectId/*")?.params.projectId;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleDeleted(payload: { projectId: string }) {
      void queryClient.invalidateQueries({ queryKey: projectKeys.list(organizationId) });
      if (payload.projectId === currentProjectId) {
        navigate("/projects", { replace: true });
      }
    }

    socket.on("project:deleted", handleDeleted);
    return () => {
      socket.off("project:deleted", handleDeleted);
    };
  }, [organizationId, currentProjectId, queryClient, navigate]);
}

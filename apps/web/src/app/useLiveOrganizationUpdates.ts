import { useEffect } from "react";
import { useMatch, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { invitationKeys } from "../entities/invitation";
import { issueKeys } from "../entities/issue";
import { labelKeys } from "../entities/label";
import { memberKeys } from "../entities/member";
import { profileKeys } from "../entities/profile";
import { projectKeys, type Project } from "../entities/project";
import { isUuid } from "../shared/lib/paths";
import { sprintKeys } from "../entities/sprint";
import { getSocket } from "../shared/socket/socket-client";

type OrganizationChange =
  | { kind: "project" }
  | { kind: "label" }
  | { kind: "sprint"; projectId: string }
  | { kind: "members" };

/**
 * Listens on the organization room (every connected member is in it), mounted
 * once in the app shell, for two things:
 *
 * - org:changed (a project, label or sprint was renamed, recoloured or deleted, or the
 *   members or invitations changed):
 *   refetch the matching list, so an open tab does not stay stale until it
 *   happens to be focused. The event only says what kind of thing changed; the
 *   data comes back through the normal endpoints.
 * - project:deleted (ADR 0022): refetch the project list, and if this person is on
 *   a page of that project, send them to the projects list with a short notice
 *   instead of leaving them on pages that would now fail.
 */
export function useLiveOrganizationUpdates(organizationId: string): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentProjectRef = useMatch("/projects/:projectKey/*")?.params.projectKey;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleChanged(change: OrganizationChange) {
      if (change.kind === "project") {
        void queryClient.invalidateQueries({ queryKey: projectKeys.list(organizationId) });
      } else if (change.kind === "members") {
        // Someone was invited, an invitation was revoked, or someone joined.
        void queryClient.invalidateQueries({ queryKey: memberKeys.list(organizationId) });
        void queryClient.invalidateQueries({ queryKey: invitationKeys.list(organizationId) });
        // A profile or photo changed: open profile pages show the same people.
        void queryClient.invalidateQueries({ queryKey: profileKeys.all });
      } else if (change.kind === "label") {
        void queryClient.invalidateQueries({ queryKey: labelKeys.list(organizationId) });
        // Issues cache their own label lists under issueKeys.all.
        void queryClient.invalidateQueries({ queryKey: issueKeys.all });
      } else {
        void queryClient.invalidateQueries({ queryKey: sprintKeys.list(change.projectId) });
        void queryClient.invalidateQueries({ queryKey: issueKeys.backlog(change.projectId) });
      }
    }

    function handleProjectDeleted(payload: { projectId: string }) {
      // Which project is on screen is read from the cache BEFORE it is refetched without the deleted one.
      const cached = queryClient.getQueryData<Project[]>(projectKeys.list(organizationId));
      const currentProjectId = cached?.find((p) =>
        currentProjectRef === undefined ? false : isUuid(currentProjectRef) ? p.id === currentProjectRef : p.key.toLowerCase() === currentProjectRef.toLowerCase(),
      )?.id;
      void queryClient.invalidateQueries({ queryKey: projectKeys.list(organizationId) });
      if (payload.projectId === currentProjectId) {
        navigate("/projects", { replace: true, state: { notice: "This project was deleted." } });
      }
    }

    socket.on("org:changed", handleChanged);
    socket.on("project:deleted", handleProjectDeleted);
    return () => {
      socket.off("org:changed", handleChanged);
      socket.off("project:deleted", handleProjectDeleted);
    };
  }, [organizationId, currentProjectRef, queryClient, navigate]);
}

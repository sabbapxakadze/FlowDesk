import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tourKey, useTourPending } from "../../../entities/profile";
import { useProjects } from "../../../entities/project";
import { apiPostVoid } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/useAuth";
import { startTour } from "../../../shared/tour";
import { buildTourSteps } from "../tourSteps";

/** People the tour was already started for in this page load: React runs the effect twice in development, and the answer can lag a moment. */
const startedFor = new Set<string>();

/**
 * Starts the guided tour (ADR 0040) by itself on a person's first visit to the app: a new registration, a new Google or GitHub account, an
 * accepted invitation (ADR 0052). The server remembers it on the account, so a reload, another device or "Skip" never brings it back; the
 * Tutorial row in the sidebar replays it. It is marked seen the moment it starts, not when it ends, so closing the tab midway does not replay it.
 * Renders nothing. The projects are read first so the tour can walk through the person's first project when they already have one.
 */
export function FirstTour() {
  const { user, organization } = useAuth();
  const queryClient = useQueryClient();
  const { data: pending } = useTourPending({ enabled: Boolean(user) });
  const projects = useProjects(organization?.id ?? "", { enabled: Boolean(organization) });
  const markSeen = useMutation({
    mutationFn: () => apiPostVoid("/v1/users/me/tour/seen"),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: tourKey() }),
  });
  const projectsSettled = projects.isSuccess || projects.isError;

  useEffect(() => {
    if (!user || !pending || !projectsSettled || startedFor.has(user.id)) return;
    startedFor.add(user.id);
    markSeen.mutate();
    startTour(buildTourSteps(projects.data?.[0]?.key));
  }, [user, pending, projectsSettled, projects.data, markSeen]);

  return null;
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sprintKeys } from "../../entities/sprint";
import { issueKeys } from "../../entities/issue";
import { completeSprint } from "./api/completeSprint";

type CompleteVariables = { sprintId: string; version: number };

/**
 * Completing a sprint returns its remaining issues to the backlog
 * server-side (see sprints.repository.ts's complete()), so the backlog
 * query is invalidated alongside the sprint list, same reasoning as
 * useStartSprint.
 */
export function useCompleteSprint(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sprintId, version }: CompleteVariables) =>
      completeSprint(organizationId, projectId, sprintId, { version }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sprintKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.backlog(projectId) });
    },
  });
}

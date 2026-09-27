import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sprintKeys } from "../../entities/sprint";
import { issueKeys } from "../../entities/issue";
import { startSprint } from "./api/startSprint";

type StartVariables = { sprintId: string; version: number };

/**
 * A hook, not form-inlined — multiple sprint-list rows share it, same
 * reasoning as useMoveIssue. Starting a sprint changes which sprint is
 * "active" for the backlog view, so both queries invalidate together.
 */
export function useStartSprint(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sprintId, version }: StartVariables) => startSprint(organizationId, projectId, sprintId, { version }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sprintKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.backlog(projectId) });
    },
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MoveIssueRequest } from "@flowdesk/contracts";
import { issueKeys } from "../../entities/issue";
import { ApiError } from "../../shared/api/client";
import { moveIssue } from "./api/moveIssue";

/**
 * A hook, not a form component's inline useMutation (unlike edit-issue/
 * create-issue) — those center on one form, so their mutation lives
 * inline in it. Move has no form: multiple buttons across the whole
 * board (up/down/move-to on every card) need the same mutation, so
 * ProjectBoardPage calls this once and passes bound callbacks down to
 * each BoardCard. See the Phase 5 slice 2 plan's "Decisions" section.
 *
 * Same invalidation set EditIssueForm uses for a status change (list,
 * detail, events) — moving can change status too, and always writes an
 * issue.moved event. No conflict-banner handling here (see the plan):
 * on a 409, this just invalidates and lets the board re-render from
 * fresh data — slice 3's optimistic-update rollback UX owns anything
 * fancier.
 */
export function useMoveIssue(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, ...input }: { issueId: string } & MoveIssueRequest) =>
      moveIssue(organizationId, projectId, issueId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.detail(variables.issueId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(variables.issueId) });
    },
    onError: (error, variables) => {
      if (error instanceof ApiError && error.code === "version_conflict") {
        void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
        void queryClient.invalidateQueries({ queryKey: issueKeys.detail(variables.issueId) });
      }
    },
  });
}

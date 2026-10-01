import { useMutation, useQueryClient } from "@tanstack/react-query";
import { issueKeys } from "../../../entities/issue";
import { ConfirmDelete } from "../../../shared/ui";
import { deleteIssue } from "../api/deleteIssue";

/**
 * Hard delete (ADR 0022): the comments, files and history go with the issue.
 * The caller decides whether to show this at all (the reporter, or an owner or
 * admin); the API is what refuses anyone else. `onDeleted` is where the page
 * navigates away from the issue that no longer exists.
 */
export function DeleteIssueButton({
  organizationId,
  projectId,
  issueId,
  onDeleted,
}: {
  organizationId: string;
  projectId: string;
  issueId: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteIssue(organizationId, projectId, issueId),
    onSuccess: () => {
      // Lists, board and backlog for this project; the issue's own queries are
      // dropped, not refetched (a refetch would be a 404).
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
      queryClient.removeQueries({ queryKey: issueKeys.detail(issueId) });
      onDeleted();
    },
  });

  return (
    <ConfirmDelete
      label="Delete issue"
      message="Delete this issue? Its comments, files and history are permanently removed. This cannot be undone."
      confirmLabel="Delete issue"
      onConfirm={() => mutation.mutate()}
      isPending={mutation.isPending}
      error={mutation.isError ? mutation.error.message : null}
    />
  );
}

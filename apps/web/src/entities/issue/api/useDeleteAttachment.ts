import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAttachment } from "./deleteAttachment";
import { issueKeys } from "./queryKeys";

export function useDeleteAttachment(organizationId: string, projectId: string, issueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (attachmentId: string) => deleteAttachment(organizationId, projectId, issueId, attachmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.attachments(issueId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(issueId) });
    },
  });
}

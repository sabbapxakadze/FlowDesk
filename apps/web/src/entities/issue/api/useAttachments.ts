import { useQuery } from "@tanstack/react-query";
import { fetchAttachments } from "./fetchAttachments";
import { issueKeys } from "./queryKeys";

export function useAttachments(organizationId: string, projectId: string, issueId: string) {
  return useQuery({
    queryKey: issueKeys.attachments(issueId),
    queryFn: () => fetchAttachments(organizationId, projectId, issueId),
  });
}

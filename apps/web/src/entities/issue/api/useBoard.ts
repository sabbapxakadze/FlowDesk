import { useQuery } from "@tanstack/react-query";
import { fetchBoard } from "./fetchBoard";
import { issueKeys } from "./queryKeys";

export function useBoard(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: issueKeys.board(projectId),
    queryFn: () => fetchBoard(organizationId, projectId),
  });
}

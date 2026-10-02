import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDeleteVoid } from "../../../shared/api/client";
import { invitationKeys } from "./queryKeys";

export function useRevokeInvitation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiDeleteVoid(`/v1/organizations/${organizationId}/invitations/${invitationId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitationKeys.list(organizationId) });
    },
  });
}

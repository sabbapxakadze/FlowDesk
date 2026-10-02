import { useQuery } from "@tanstack/react-query";
import { fetchInvitations } from "./fetchInvitations";
import { invitationKeys } from "./queryKeys";

/**
 * The open invitations. Only owners and admins may read them (the API answers 403
 * to anyone else), so callers pass `enabled: false` for other roles instead of
 * firing a request that is certain to fail.
 */
export function useInvitations(organizationId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: invitationKeys.list(organizationId),
    queryFn: () => fetchInvitations(organizationId),
    enabled: options.enabled ?? true,
  });
}

import { useCallback } from "react";
import { useAuth } from "../../../shared/auth/useAuth";
import { useQuery } from "@tanstack/react-query";
import { fetchMembers } from "./fetchMembers";
import { memberKeys } from "./queryKeys";

export function useMembers(organizationId: string) {
  return useQuery({
    queryKey: memberKeys.list(organizationId),
    queryFn: () => fetchMembers(organizationId),
    // Who is in the organization changes rarely; a list that is a minute old is fine.
    staleTime: 60_000,
  });
}

/**
 * A lookup from a user id to a name, for showing an assignee on a card. Issues
 * carry only the assignee's id (lists stay free of a user join), so names come
 * from the member list, which is fetched once and shared by every card.
 * Returns null for "unassigned" and while the list is still loading.
 */
export function useMemberNames(organizationId: string) {
  const { data } = useMembers(organizationId);
  return useCallback(
    (userId: string | null): string | null =>
      userId === null
        ? null
        : (data?.find((member) => member.userId === userId)?.name ?? null),
    [data],
  );
}

/**
 * The signed-in user's role in the organization, from the member list; undefined
 * until it loads. For SHOWING or HIDING controls only: the API is what actually
 * refuses an action the role does not allow.
 */
export function useMyRole(organizationId: string) {
  const { user } = useAuth();
  const { data } = useMembers(organizationId);
  return data?.find((member) => member.userId === user?.id)?.role;
}

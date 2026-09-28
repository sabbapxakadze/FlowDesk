import { useQuery } from "@tanstack/react-query";
import { fetchProjects } from "./fetchProjects";
import { projectKeys } from "./queryKeys";

/**
 * `enabled` defaults to true — every existing caller renders inside
 * RequireAuth, where organizationId is always real, so this stays a
 * no-op for them. CommandPalette (Phase 7 slice 2) is the first caller
 * that can render pre-login, and needs to suppress the query entirely
 * rather than fire it against an empty organizationId.
 */
export function useProjects(organizationId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: projectKeys.list(organizationId),
    queryFn: () => fetchProjects(organizationId),
    enabled: options?.enabled ?? true,
  });
}

/**
 * Query key factory — even with one query, starting this now sets the
 * convention Phase 4 formalizes ("TanStack Query conventions: keys,
 * invalidation, staleness" in docs/roadmap.md). Keys are hierarchical so
 * a mutation can invalidate broadly (`projectKeys.all`) or narrowly
 * (`projectKeys.list(orgId)`) once writes exist.
 */
export const projectKeys = {
  all: ["organizations", "projects"] as const,
  list: (organizationId: string) => [...projectKeys.all, organizationId] as const,
  // The Projects page's numbers (ADR 0059): under `list`, so creating, renaming or deleting a project (which invalidate `list`) refreshes them too.
  summaries: (organizationId: string) => [...projectKeys.list(organizationId), "summaries"] as const,
};

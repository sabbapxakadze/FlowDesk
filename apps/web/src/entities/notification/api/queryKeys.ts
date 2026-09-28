/** Not nested under projectKeys/issueKeys — notifications are org-wide,
 * scoped to the requesting user, same "own base array" reasoning as any
 * other top-level resource. Keyed by organizationId only (not a filter
 * object) — there's no filter this slice's endpoint accepts. */
export const notificationKeys = {
  all: (organizationId: string) => ["organizations", organizationId, "notifications"] as const,
  list: (organizationId: string) => [...notificationKeys.all(organizationId), "list"] as const,
  unreadCount: (organizationId: string) => [...notificationKeys.all(organizationId), "unread-count"] as const,
};

export type AuditFilters = { actor?: string; kind?: "project" | "label" | "sprint" | "issue" | "member" };

export const auditKeys = {
  all: ["organizations", "audit-events"] as const,
  list: (organizationId: string, filters: AuditFilters = {}) => [...auditKeys.all, organizationId, filters] as const,
};

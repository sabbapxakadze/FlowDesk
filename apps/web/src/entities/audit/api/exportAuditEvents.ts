import { apiDownload } from "../../../shared/api/client";
import type { AuditFilters } from "./queryKeys";

/** The audit log as a CSV file, for the same person and kind filters the list uses. */
export function exportAuditEvents(organizationId: string, filters: AuditFilters) {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.kind) params.set("kind", filters.kind);
  const query = params.toString();
  return apiDownload(`/v1/organizations/${organizationId}/audit-events/export${query ? `?${query}` : ""}`);
}

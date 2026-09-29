import * as analyticsRepository from "./analytics.repository.js";

// Pass-through: read-only, nothing to broadcast or coordinate. Kept as a
// real layer so business rules (e.g. caching, org-wide rollups) have a
// home later without touching the controller or repository.
export async function getThroughput(organizationId: string, projectId: string, weeks: number) {
  return analyticsRepository.throughputByWeek(organizationId, projectId, weeks);
}

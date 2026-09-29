import * as analyticsRepository from "./analytics.repository.js";

// Pass-throughs: read-only, nothing to broadcast or coordinate. Kept as a
// real layer so business rules (e.g. caching, org-wide rollups) have a
// home later without touching the controller or repository.
export async function getThroughput(organizationId: string, projectId: string, weeks: number) {
  return analyticsRepository.throughputByWeek(organizationId, projectId, weeks);
}

export async function getCycleTime(organizationId: string, projectId: string, weeks: number) {
  return analyticsRepository.cycleTime(organizationId, projectId, weeks);
}

// The headline is the mean of what each returned sprint completed. It is
// arithmetic on the result, not a query, so it lives here rather than in
// the repository (which stays Drizzle/SQL only).
export async function getVelocity(organizationId: string, projectId: string, sprints: number) {
  const rows = await analyticsRepository.sprintVelocity(organizationId, projectId, sprints);
  const averageCompleted =
    rows.length === 0 ? null : Math.round((rows.reduce((sum, r) => sum + r.completed, 0) / rows.length) * 10) / 10;
  return { averageCompleted, rows };
}

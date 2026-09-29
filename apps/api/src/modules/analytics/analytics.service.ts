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

const TOP_LABELS = 10;
const STATUS_ORDER = ["todo", "in_progress", "done"] as const;

// Shaping, not querying: zero-fill the three statuses in workflow order,
// take the top labels, and say how many were left out so a long tail is
// acknowledged rather than silently cut.
export async function getBreakdown(organizationId: string, projectId: string) {
  const [statusRows, labelRows, unlabeled] = await Promise.all([
    analyticsRepository.statusCounts(organizationId, projectId),
    analyticsRepository.openLabelCounts(organizationId, projectId),
    analyticsRepository.openUnlabeledCount(organizationId, projectId),
  ]);

  const counts = new Map<string, number>(statusRows.map((row) => [row.status, row.count]));
  const byStatus = STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  const total = byStatus.reduce((sum, row) => sum + row.count, 0);
  const openTotal = total - (counts.get("done") ?? 0);

  return {
    total,
    openTotal,
    byStatus,
    byLabel: labelRows.slice(0, TOP_LABELS),
    unlabeled,
    hiddenLabels: Math.max(0, labelRows.length - TOP_LABELS),
  };
}

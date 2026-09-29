/** Own base array, not nested under projectKeys/issueKeys: these are read
 * models computed on the server, not cached domain objects. Keyed by
 * project and window so changing the range is a distinct cache entry. */
export const analyticsKeys = {
  all: (projectId: string) => ["analytics", projectId] as const,
  throughput: (projectId: string, weeks: number) => [...analyticsKeys.all(projectId), "throughput", weeks] as const,
  velocity: (projectId: string, sprints: number) => [...analyticsKeys.all(projectId), "velocity", sprints] as const,
  cycleTime: (projectId: string, weeks: number) => [...analyticsKeys.all(projectId), "cycle-time", weeks] as const,
};

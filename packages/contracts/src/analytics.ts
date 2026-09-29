import { z } from "zod";
import { issueStatusSchema } from "./issue.js";

// coerce because query params arrive as strings. 52 = a year of weekly
// bars, plenty for a chart; the cap keeps the generate_series bounded.
export const weeksQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(52).default(12),
});

export type WeeksQuery = z.infer<typeof weeksQuerySchema>;

// weekStart is the Monday (UTC) that begins the week, as YYYY-MM-DD.
// See docs/adr/0009-analytics-from-events.md for what "completed" means.
export const throughputPointSchema = z.object({
  weekStart: z.iso.date(),
  completed: z.number().int().nonnegative(),
});

export const throughputResponseSchema = z.object({
  data: z.array(throughputPointSchema),
});

export type ThroughputPoint = z.infer<typeof throughputPointSchema>;
export type ThroughputResponse = z.infer<typeof throughputResponseSchema>;

// One value per finished issue: first entry into in_progress -> first
// completion after it. Issues that finished without ever being in progress
// have no cycle time; they are counted in withoutStart, not hidden.
// Days carry one decimal. See docs/adr/0010-cycle-time-definition.md.
export const cycleTimeSummarySchema = z.object({
  completed: z.number().int().nonnegative(),
  withoutStart: z.number().int().nonnegative(),
  averageDays: z.number().nullable(),
  medianDays: z.number().nullable(),
  p90Days: z.number().nullable(),
});

export const cycleTimeBucketSchema = z.object({
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const cycleTimeResponseSchema = z.object({
  summary: cycleTimeSummarySchema,
  distribution: z.array(cycleTimeBucketSchema),
});

export type CycleTimeSummary = z.infer<typeof cycleTimeSummarySchema>;
export type CycleTimeBucket = z.infer<typeof cycleTimeBucketSchema>;
export type CycleTimeResponse = z.infer<typeof cycleTimeResponseSchema>;

// The most recent N completed sprints. Sprint membership at close comes from
// the issue.sprint_removed events complete() writes, not from issues.sprint_id
// (which complete() clears). See docs/adr/0011-sprint-velocity-from-completion-events.md.
export const sprintsQuerySchema = z.object({
  sprints: z.coerce.number().int().min(1).max(20).default(8),
});

export type SprintsQuery = z.infer<typeof sprintsQuerySchema>;

// committed = issues in the sprint when it closed; completed = those that
// were done at that moment (carried over = committed - completed).
export const velocitySprintSchema = z.object({
  sprintId: z.uuid(),
  name: z.string(),
  completedAt: z.iso.datetime(),
  committed: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

export const velocityResponseSchema = z.object({
  summary: z.object({ averageCompleted: z.number().nullable() }),
  data: z.array(velocitySprintSchema),
});

export type VelocitySprint = z.infer<typeof velocitySprintSchema>;
export type VelocityResponse = z.infer<typeof velocityResponseSchema>;

// A snapshot of the CURRENT state (not history), read from the tables rather
// than the event log — see docs/adr/0012-breakdowns-read-current-state.md.
// byStatus always has the three statuses in workflow order. byLabel is the
// top labels by OPEN issue count; an issue with two labels is counted under
// both, so those counts can sum to more than openTotal. unlabeled = open
// issues with no label; hiddenLabels = labels beyond the ones returned.
export const breakdownResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  openTotal: z.number().int().nonnegative(),
  byStatus: z.array(z.object({ status: issueStatusSchema, count: z.number().int().nonnegative() })),
  byLabel: z.array(z.object({ labelId: z.uuid(), name: z.string(), count: z.number().int().nonnegative() })),
  unlabeled: z.number().int().nonnegative(),
  hiddenLabels: z.number().int().nonnegative(),
});

export type BreakdownResponse = z.infer<typeof breakdownResponseSchema>;

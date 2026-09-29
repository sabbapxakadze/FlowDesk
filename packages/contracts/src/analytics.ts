import { z } from "zod";

// coerce because query params arrive as strings. 52 = a year of weekly
// bars, plenty for a chart; the cap keeps the generate_series bounded.
export const throughputQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(52).default(12),
});

export type ThroughputQuery = z.infer<typeof throughputQuerySchema>;

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

import { z } from "zod";
import { issueSchema } from "./issue.js";

export const sprintStatusSchema = z.enum(["planned", "active", "completed"]);
export type SprintStatus = z.infer<typeof sprintStatusSchema>;

export const sprintSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  status: sprintStatusSchema,
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Sprint = z.infer<typeof sprintSchema>;

// Same envelope convention as project.ts's list response.
export const listSprintsResponseSchema = z.object({
  data: z.array(sprintSchema),
});

export type ListSprintsResponse = z.infer<typeof listSprintsResponseSchema>;

export const createSprintRequestSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255, "Name is too long"),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  });

export type CreateSprintRequest = z.infer<typeof createSprintRequestSchema>;

export const createSprintResponseSchema = z.object({
  data: sprintSchema,
});

export type CreateSprintResponse = z.infer<typeof createSprintResponseSchema>;

// start/complete both take only the version the client read — same
// optimistic-concurrency shape as updateIssueRequestSchema, just with
// nothing else to change.
export const startSprintRequestSchema = z.object({
  version: z.number().int(),
});

export type StartSprintRequest = z.infer<typeof startSprintRequestSchema>;

export const completeSprintRequestSchema = z.object({
  version: z.number().int(),
});

export type CompleteSprintRequest = z.infer<typeof completeSprintRequestSchema>;

export const sprintResponseSchema = z.object({
  data: sprintSchema,
});

export type SprintResponse = z.infer<typeof sprintResponseSchema>;

// Powers the whole backlog/active-sprint page in one unpaginated call —
// same "see everything at a glance" precedent as issue.ts's
// getBoardResponseSchema. activeSprint is null when no sprint in the
// project is currently active.
export const getBacklogResponseSchema = z.object({
  activeSprint: sprintSchema.nullable(),
  backlog: z.array(issueSchema),
  activeSprintIssues: z.array(issueSchema),
});

export type GetBacklogResponse = z.infer<typeof getBacklogResponseSchema>;

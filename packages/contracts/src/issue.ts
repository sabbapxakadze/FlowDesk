import { z } from "zod";

export const issueStatusSchema = z.enum(["todo", "in_progress", "done"]);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

export const issueSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid(),
  number: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  status: issueStatusSchema,
  reporterId: z.uuid(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Issue = z.infer<typeof issueSchema>;

// Same envelope convention as project.ts's list response — { data: [...] }
// leaves room for pagination metadata later without changing the shape.
export const listIssuesResponseSchema = z.object({
  data: z.array(issueSchema),
});

export type ListIssuesResponse = z.infer<typeof listIssuesResponseSchema>;

export const createIssueRequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title is too long"),
  description: z.string().max(10000, "Description is too long").optional(),
});

export type CreateIssueRequest = z.infer<typeof createIssueRequestSchema>;

export const createIssueResponseSchema = z.object({
  data: issueSchema,
});

export type CreateIssueResponse = z.infer<typeof createIssueResponseSchema>;

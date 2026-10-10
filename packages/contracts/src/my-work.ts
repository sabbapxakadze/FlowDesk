import { z } from "zod";
import { issuePrioritySchema, issueStatusSchema } from "./issue.js";

/**
 * "My work" (the page `/` opens): the open issues assigned to the signed-in person across ALL the projects of the
 * organization. A row carries its project's key and name so the page can name where it lives without a second
 * request. Open means not done.
 */
export const assignedIssueSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  title: z.string(),
  status: issueStatusSchema,
  priority: issuePrioritySchema,
  dueDate: z.iso.date().nullable(),
  projectId: z.uuid(),
  projectKey: z.string(),
  projectName: z.string(),
  updatedAt: z.iso.datetime(),
});
export type AssignedIssue = z.infer<typeof assignedIssueSchema>;

export const listAssignedIssuesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type ListAssignedIssuesQuery = z.infer<typeof listAssignedIssuesQuerySchema>;

/** `total` is how many open issues are assigned in all (the page shows `data`, at most `limit`, and the count). */
export const listAssignedIssuesResponseSchema = z.object({
  data: z.array(assignedIssueSchema),
  total: z.number().int(),
});
export type ListAssignedIssuesResponse = z.infer<typeof listAssignedIssuesResponseSchema>;

/**
 * The week ring on My work: of the issues assigned to me that are due from `from` to `to` (calendar days, both included,
 * the person's own Monday to Sunday), how many are done and how many there are in all. Done issues do not show in the
 * open list, so this is the only place they are counted. Issues without a due date are not counted (ADR 0057).
 */
export const weekProgressQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((q) => q.from <= q.to, { message: "from must not be after to", path: ["to"] });
export type WeekProgressQuery = z.infer<typeof weekProgressQuerySchema>;

export const weekProgressResponseSchema = z.object({
  done: z.number().int(),
  total: z.number().int(),
});
export type WeekProgressResponse = z.infer<typeof weekProgressResponseSchema>;

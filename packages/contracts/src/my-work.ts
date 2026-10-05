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

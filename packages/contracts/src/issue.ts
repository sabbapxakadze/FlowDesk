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
// left room for pagination metadata without changing the shape; nextCursor
// is that metadata, added in Phase 4 slice 1. null means no further pages.
export const listIssuesResponseSchema = z.object({
  data: z.array(issueSchema),
  nextCursor: z.string().nullable(),
});

export type ListIssuesResponse = z.infer<typeof listIssuesResponseSchema>;

// Keyset pagination + filter/sort query params. cursor is opaque
// (server-generated, see issues.repository.ts) — the client never
// constructs one, only passes back what a previous response gave it.
// limit is capped, not just defaulted, so a client can't request an
// unbounded page. order is direction-only (created_at is the only
// sortable column today, see the Phase 4 slice 2 plan's "Decisions").
export const listIssuesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: issueStatusSchema.optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;

export const getIssueResponseSchema = z.object({
  data: issueSchema,
});

export type GetIssueResponse = z.infer<typeof getIssueResponseSchema>;

// Every issue in the project, pre-sorted by (status, board_rank) for the
// Kanban board — unpaginated, deliberately (see the Phase 5 slice 1
// plan's "Decisions" section). board_rank itself is never part of
// issueSchema — see ADR 0007: the client only ever expresses "put this
// issue relative to that one," never touches a rank value directly.
export const getBoardResponseSchema = z.object({
  data: z.array(issueSchema),
});

export type GetBoardResponse = z.infer<typeof getBoardResponseSchema>;

export const createIssueRequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title is too long"),
  description: z.string().max(10000, "Description is too long").optional(),
});

export type CreateIssueRequest = z.infer<typeof createIssueRequestSchema>;

export const createIssueResponseSchema = z.object({
  data: issueSchema,
});

export type CreateIssueResponse = z.infer<typeof createIssueResponseSchema>;

// version is required (the value the client read, per CLAUDE.md's
// concurrency convention), everything else is an optional partial update.
// The refine guards against a pointless PATCH that only carries a version
// and nothing to actually change.
export const updateIssueRequestSchema = z
  .object({
    version: z.number().int(),
    title: z.string().min(1, "Title is required").max(500, "Title is too long").optional(),
    description: z.string().max(10000, "Description is too long").nullable().optional(),
    status: issueStatusSchema.optional(),
  })
  .refine((data) => data.title !== undefined || data.description !== undefined || data.status !== undefined, {
    message: "At least one of title, description, or status must be provided.",
  });

export type UpdateIssueRequest = z.infer<typeof updateIssueRequestSchema>;

export const updateIssueResponseSchema = z.object({
  data: issueSchema,
});

export type UpdateIssueResponse = z.infer<typeof updateIssueResponseSchema>;

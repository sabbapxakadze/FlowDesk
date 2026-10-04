import { z } from "zod";

export const issueStatusSchema = z.enum(["todo", "in_progress", "done"]);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

// Order matters: it is the order the UI lists them in (most urgent last in the
// enum on purpose so "none" is the natural default and first value).
export const issuePrioritySchema = z.enum(["none", "low", "medium", "high", "urgent"]);
export type IssuePriority = z.infer<typeof issuePrioritySchema>;

export const issueSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid(),
  number: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  status: issueStatusSchema,
  priority: issuePrioritySchema,
  // Null = unassigned. The id only, not a name: lists stay free of a user join
  // and the web app resolves names from the organization's member list.
  assigneeId: z.uuid().nullable(),
  reporterId: z.uuid(),
  version: z.number().int(),
  sprintId: z.uuid().nullable(),
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
// unbounded page. sort picks the column ("created" is the default,
// "priority" orders by the priority enum's own order: urgent > high > medium
// > low > none) and order is the direction of the WHOLE sort key, so
// sort=priority&order=desc is urgent first and, within one priority, newest
// first (ADR 0026).
export const listIssuesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: issueStatusSchema.optional(),
  priority: issuePrioritySchema.optional(),
  // A user id, or "unassigned". ("Assigned to me" is the client sending its own id.)
  assignee: z.union([z.uuid(), z.literal("unassigned")]).optional(),
  sort: z.enum(["created", "priority"]).default("created"),
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
    priority: issuePrioritySchema.optional(),
    // null unassigns; absent leaves it alone.
    assigneeId: z.uuid().nullable().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.status !== undefined ||
      data.priority !== undefined ||
      data.assigneeId !== undefined,
    {
      message: "At least one of title, description, status, priority, or assignee must be provided.",
    },
  );

export type UpdateIssueRequest = z.infer<typeof updateIssueRequestSchema>;

export const updateIssueResponseSchema = z.object({
  data: issueSchema,
});

// Only two real shapes matter (see ADR 0007 / the Phase 5 slice 2 plan's
// "Decisions"): neither neighbor means "append to the end of `status`";
// nextIssueId present means "insert before that card" (with prevIssueId
// as the lower bound, if the target isn't the very first card).
// prevIssueId alone (no nextIssueId) is treated as "append" server-side.
export const moveIssueRequestSchema = z.object({
  version: z.number().int(),
  status: issueStatusSchema,
  prevIssueId: z.uuid().optional(),
  nextIssueId: z.uuid().optional(),
});

export type MoveIssueRequest = z.infer<typeof moveIssueRequestSchema>;

// Response reuses updateIssueResponseSchema's shape exactly — no new
// schema needed, moveIssueResponseSchema would just be an alias.

export type UpdateIssueResponse = z.infer<typeof updateIssueResponseSchema>;

// null means "move to the backlog". prevIssueId / nextIssueId place the issue inside the target list,
// with the same meaning as the board's move: nextIssueId = insert before that issue, prevIssueId = the
// lower bound, neither = at the end of the list. Both must be in the TARGET list (ADR 0008, amended).
// Response reuses updateIssueResponseSchema's shape, same precedent as moveIssueRequestSchema.
export const assignIssueSprintRequestSchema = z.object({
  version: z.number().int(),
  sprintId: z.uuid().nullable(),
  prevIssueId: z.uuid().optional(),
  nextIssueId: z.uuid().optional(),
});

export type AssignIssueSprintRequest = z.infer<typeof assignIssueSprintRequestSchema>;

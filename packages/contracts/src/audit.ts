import { z } from "zod";

/**
 * The organization audit log (Phase 8.5, ADR 0027): who did what to the organization's shared
 * things, kept after those things are gone. Issue-level history stays in issue_events; this
 * covers what that cannot (deleted issues, projects, labels, sprints, and membership).
 */

export const AUDIT_ACTIONS = [
  "project.created",
  "project.renamed",
  "project.deleted",
  "label.updated",
  "label.deleted",
  "sprint.renamed",
  "sprint.started",
  "sprint.completed",
  "sprint.deleted",
  "issue.deleted",
  "member.invited",
  "invitation.revoked",
  "invitation.resent",
  "member.joined",
  "member.role_changed",
  "member.removed",
] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

// What the action was done to. Invitations are filed under "member" (the person invited).
export const auditTargetTypeSchema = z.enum(["project", "label", "sprint", "issue", "member"]);
export type AuditTargetType = z.infer<typeof auditTargetTypeSchema>;

export const auditEventSchema = z.object({
  id: z.uuid(),
  /** Null only if the user account itself no longer exists. */
  actorId: z.uuid().nullable(),
  /** The actor's name at the time, so the log reads the same after a rename. */
  actorName: z.string(),
  action: auditActionSchema,
  targetType: auditTargetTypeSchema,
  /** The thing's name, title or email at the time (it may no longer exist). */
  targetLabel: z.string(),
  /** Before and after values and similar, shaped per action. */
  details: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

// Keyset pagination like the issue list: the cursor is opaque and server-made.
export const listAuditEventsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** Only this person's actions. */
  actor: z.uuid().optional(),
  /** Only actions on this kind of thing. */
  kind: auditTargetTypeSchema.optional(),
});
export type ListAuditEventsQuery = z.infer<typeof listAuditEventsQuerySchema>;

// The CSV export takes the same two filters as the list (no paging: it is one file, newest first, capped).
export const exportAuditEventsQuerySchema = listAuditEventsQuerySchema.pick({ actor: true, kind: true });
export type ExportAuditEventsQuery = z.infer<typeof exportAuditEventsQuerySchema>;

/** The most rows one export holds; the file says so on its last line when there were more. */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

export const listAuditEventsResponseSchema = z.object({
  data: z.array(auditEventSchema),
  nextCursor: z.string().nullable(),
});
export type ListAuditEventsResponse = z.infer<typeof listAuditEventsResponseSchema>;

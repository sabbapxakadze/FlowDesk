import type { Request, Response } from "express";
import { auditActionSchema, listAuditEventsQuerySchema, listAuditEventsResponseSchema } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as auditRepository from "./audit.repository.js";

export async function list(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listAuditEvents requires requireOrgMembership to have run first");
  }
  const parsed = listAuditEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid audit log query", parsed.error.flatten().fieldErrors);
  }

  const result = await auditRepository.list(req.ctx.organizationId, parsed.data);
  if (result.status === "invalid_cursor") {
    throw new AppError("invalid_cursor", 400, "Invalid pagination cursor.");
  }

  res.json(
    listAuditEventsResponseSchema.parse({
      data: result.items.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actorName,
        // A row whose action this version does not know cannot be shown meaningfully; fail
        // loudly here rather than hand the web app a shape it does not have.
        action: auditActionSchema.parse(row.action),
        targetType: row.targetType,
        targetLabel: row.targetLabel,
        details: row.details as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: result.nextCursor,
    }),
  );
}

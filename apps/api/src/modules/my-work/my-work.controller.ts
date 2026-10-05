import type { Request, Response } from "express";
import { listAssignedIssuesQuerySchema, listAssignedIssuesResponseSchema } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as myWorkRepository from "./my-work.repository.js";

export async function listAssigned(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listAssigned requires requireOrgMembership to have run first");
  }
  const parsed = listAssignedIssuesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid query", parsed.error.flatten().fieldErrors);
  }
  const { items, total } = await myWorkRepository.listAssignedTo(req.ctx.organizationId, req.ctx.userId, parsed.data.limit);
  res.json(
    listAssignedIssuesResponseSchema.parse({
      data: items.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      total,
    }),
  );
}

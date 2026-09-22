import type { Request, Response } from "express";
import {
  createProjectRequestSchema,
  createProjectResponseSchema,
  listProjectsResponseSchema,
} from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as projectsService from "./projects.service.js";

// Drizzle returns Date objects for timestamp columns; the wire format is
// ISO strings (see packages/contracts) — this is where that conversion
// belongs, since shaping the response is the controller's job.
function toWireFormat(row: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/**
 * organizationId no longer comes from req.params directly — req.ctx is
 * set by requireOrgMembership (see middleware/require-org-membership.ts)
 * only once a real membership row was found. This is the actual fix for
 * the old "hardcoded org id" gap: the URL can say anything, but data only
 * ever comes back for an org req.ctx confirms the caller belongs to.
 */
export async function listProjects(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listProjects requires requireOrgMembership to have run first");
  }

  const rows = await projectsService.listProjects(req.ctx.organizationId);
  const body = listProjectsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function createProject(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("createProject requires requireOrgMembership to have run first");
  }

  const parsed = createProjectRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid project details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const project = await projectsService.createProject({
    organizationId: req.ctx.organizationId,
    name: parsed.data.name,
    key: parsed.data.key,
  });

  const body = createProjectResponseSchema.parse({ data: toWireFormat(project) });
  res.status(201).json(body);
}

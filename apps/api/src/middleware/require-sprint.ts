import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as sprintsRepository from "../modules/sprints/sprints.repository.js";
import { AppError } from "../shared/errors.js";

const sprintIdSchema = z.uuid();

/**
 * Same shape as requireIssue, one level deeper than requireProject:
 * req.ctx.sprintId is only populated once findById confirms :sprintId
 * resolves to a sprint in the project/org already established by
 * requireOrgMembership/requireProject. Must run after requireProject.
 */
export async function requireSprint(req: Request, _res: Response, next: NextFunction) {
  if (!req.ctx?.projectId) {
    throw new Error("requireSprint must run after requireProject");
  }

  const parsedSprintId = sprintIdSchema.safeParse(req.params.sprintId);
  if (!parsedSprintId.success) {
    throw new AppError("invalid_sprint_id", 400, "sprintId must be a UUID.");
  }
  const sprintId = parsedSprintId.data;

  const sprint = await sprintsRepository.findById(req.ctx.organizationId, req.ctx.projectId, sprintId);
  if (!sprint) {
    throw new AppError("sprint_not_found", 404, "Sprint not found.");
  }

  req.ctx = { ...req.ctx, sprintId };
  next();
}

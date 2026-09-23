import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as projectsRepository from "../modules/projects/projects.repository.js";
import { AppError } from "../shared/errors.js";

const projectIdSchema = z.uuid();

/**
 * Same shape as requireOrgMembership, one level deeper: req.ctx.projectId
 * is only ever populated once findById confirms the :projectId route
 * param actually resolves to a project in the caller's own organization
 * (req.ctx.organizationId). A 404, not 403 — an unrecognized id and a
 * real project in a different org should look identical from the
 * outside; either way there's nothing here for this caller.
 * Must run after requireOrgMembership.
 */
export async function requireProject(req: Request, _res: Response, next: NextFunction) {
  if (!req.ctx) {
    throw new Error("requireProject must run after requireOrgMembership");
  }

  const parsedProjectId = projectIdSchema.safeParse(req.params.projectId);
  if (!parsedProjectId.success) {
    throw new AppError("invalid_project_id", 400, "projectId must be a UUID.");
  }
  const projectId = parsedProjectId.data;

  const project = await projectsRepository.findById(req.ctx.organizationId, projectId);
  if (!project) {
    throw new AppError("project_not_found", 404, "Project not found.");
  }

  req.ctx = { ...req.ctx, projectId };
  next();
}

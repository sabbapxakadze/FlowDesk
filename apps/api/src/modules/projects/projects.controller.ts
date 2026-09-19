import type { Request, Response } from "express";
import { z } from "zod";
import { listProjectsResponseSchema } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as projectsService from "./projects.service.js";

const paramsSchema = z.object({ organizationId: z.uuid() });

export async function listProjects(req: Request, res: Response) {
  const parsedParams = paramsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    throw new AppError("invalid_organization_id", 400, "organizationId must be a UUID");
  }

  const rows = await projectsService.listProjects(parsedParams.data.organizationId);

  // Drizzle returns Date objects for timestamp columns; the wire format is
  // ISO strings (see packages/contracts) — this is where that conversion
  // belongs, since shaping the response is the controller's job.
  const projects = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  const body = listProjectsResponseSchema.parse({ data: projects });
  res.json(body);
}

import type { Request, Response } from "express";
import { throughputQuerySchema, throughputResponseSchema } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as analyticsService from "./analytics.service.js";

export async function getThroughput(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getThroughput requires requireProject to have run first");
  }

  const parsed = throughputQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid analytics query", parsed.error.flatten().fieldErrors);
  }

  const rows = await analyticsService.getThroughput(req.ctx.organizationId, req.ctx.projectId, parsed.data.weeks);
  res.json(throughputResponseSchema.parse({ data: rows }));
}

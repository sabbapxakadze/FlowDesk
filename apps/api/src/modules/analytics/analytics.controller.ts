import type { Request, Response } from "express";
import { cycleTimeResponseSchema, throughputResponseSchema, weeksQuerySchema } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as analyticsService from "./analytics.service.js";

// Both analytics endpoints take the same ?weeks= window; parse it once.
function parseWeeks(req: Request): number {
  const parsed = weeksQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid analytics query", parsed.error.flatten().fieldErrors);
  }
  return parsed.data.weeks;
}

export async function getThroughput(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getThroughput requires requireProject to have run first");
  }

  const rows = await analyticsService.getThroughput(req.ctx.organizationId, req.ctx.projectId, parseWeeks(req));
  res.json(throughputResponseSchema.parse({ data: rows }));
}

export async function getCycleTime(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getCycleTime requires requireProject to have run first");
  }

  const result = await analyticsService.getCycleTime(req.ctx.organizationId, req.ctx.projectId, parseWeeks(req));
  res.json(cycleTimeResponseSchema.parse(result));
}

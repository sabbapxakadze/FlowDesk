import type { Request, Response } from "express";
import {
  createIssueRequestSchema,
  createIssueResponseSchema,
  listIssuesResponseSchema,
  updateIssueRequestSchema,
  updateIssueResponseSchema,
} from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as issuesService from "./issues.service.js";

// Same Date -> ISO string conversion projects.controller.ts does — Drizzle
// returns Date objects, the wire format is ISO strings (see contracts).
function toWireFormat(row: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function listIssues(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("listIssues requires requireProject to have run first");
  }

  const rows = await issuesService.listIssues(req.ctx.organizationId, req.ctx.projectId);
  const body = listIssuesResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function createIssue(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("createIssue requires requireProject to have run first");
  }

  const parsed = createIssueRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid issue details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const issue = await issuesService.createIssue({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    reporterId: req.ctx.userId,
  });

  const body = createIssueResponseSchema.parse({ data: toWireFormat(issue) });
  res.status(201).json(body);
}

export async function updateIssue(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.issueId) {
    throw new Error("updateIssue requires requireIssue to have run first");
  }

  const parsed = updateIssueRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid issue update",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { version, ...changes } = parsed.data;
  const result = await issuesService.updateIssue({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    issueId: req.ctx.issueId,
    expectedVersion: version,
    changes,
    actorId: req.ctx.userId,
  });

  if (result.status === "conflict") {
    throw new AppError(
      "version_conflict",
      409,
      "This issue was changed by someone else since you loaded it.",
      undefined,
      { current: toWireFormat(result.current) },
    );
  }

  if (result.status === "not_found") {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }

  const body = updateIssueResponseSchema.parse({ data: toWireFormat(result.issue) });
  res.json(body);
}

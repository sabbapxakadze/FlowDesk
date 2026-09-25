import type { Request, Response } from "express";
import { z } from "zod";
import {
  attachLabelRequestSchema,
  createCommentRequestSchema,
  createCommentResponseSchema,
  createIssueRequestSchema,
  createIssueResponseSchema,
  getIssueResponseSchema,
  listIssueEventsResponseSchema,
  listIssuesQuerySchema,
  listIssuesResponseSchema,
  listLabelsResponseSchema,
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

// issue_events has no updatedAt (append-only, never modified) — a
// separate helper rather than making toWireFormat's updatedAt optional
// and having every other caller need to handle that case too.
function eventToWireFormat(row: { createdAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listIssues(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("listIssues requires requireProject to have run first");
  }

  const parsedQuery = listIssuesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid pagination parameters",
      parsedQuery.error.flatten().fieldErrors,
    );
  }

  const result = await issuesService.listIssues(req.ctx.organizationId, req.ctx.projectId, parsedQuery.data);

  if (result.status === "invalid_cursor") {
    throw new AppError("invalid_cursor", 400, "Invalid pagination cursor.");
  }

  const body = listIssuesResponseSchema.parse({
    data: result.items.map(toWireFormat),
    nextCursor: result.nextCursor,
  });
  res.json(body);
}

export async function getIssue(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.issueId) {
    throw new Error("getIssue requires requireIssue to have run first");
  }

  const issue = await issuesService.getIssue(req.ctx.organizationId, req.ctx.projectId, req.ctx.issueId);
  if (!issue) {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }

  const body = getIssueResponseSchema.parse({ data: toWireFormat(issue) });
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

export async function listIssueLabels(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("listIssueLabels requires requireIssue to have run first");
  }

  const rows = await issuesService.listIssueLabels(req.ctx.organizationId, req.ctx.issueId);
  const body = listLabelsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function createComment(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("createComment requires requireIssue to have run first");
  }

  const parsed = createCommentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid comment",
      parsed.error.flatten().fieldErrors,
    );
  }

  const comment = await issuesService.addComment({
    issueId: req.ctx.issueId,
    authorId: req.ctx.userId,
    body: parsed.data.body,
  });

  const body = createCommentResponseSchema.parse({ data: toWireFormat(comment) });
  res.status(201).json(body);
}

export async function listIssueEvents(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("listIssueEvents requires requireIssue to have run first");
  }

  const rows = await issuesService.listIssueEvents(req.ctx.organizationId, req.ctx.issueId);
  const body = listIssueEventsResponseSchema.parse({ data: rows.map(eventToWireFormat) });
  res.json(body);
}

export async function attachLabel(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("attachLabel requires requireIssue to have run first");
  }

  const parsed = attachLabelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid label attachment",
      parsed.error.flatten().fieldErrors,
    );
  }

  const result = await issuesService.attachLabel({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    labelId: parsed.data.labelId,
    actorId: req.ctx.userId,
  });

  if (result.status === "label_not_found") {
    throw new AppError("label_not_found", 404, "Label not found.");
  }

  const rows = await issuesService.listIssueLabels(req.ctx.organizationId, req.ctx.issueId);
  const body = listLabelsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.status(201).json(body);
}

export async function detachLabel(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("detachLabel requires requireIssue to have run first");
  }

  const parsedLabelId = z.uuid().safeParse(req.params.labelId);
  if (!parsedLabelId.success) {
    throw new AppError("invalid_label_id", 400, "labelId must be a UUID.");
  }

  const result = await issuesService.detachLabel({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    labelId: parsedLabelId.data,
    actorId: req.ctx.userId,
  });

  if (result.status === "label_not_found") {
    throw new AppError("label_not_found", 404, "Label not found.");
  }

  const rows = await issuesService.listIssueLabels(req.ctx.organizationId, req.ctx.issueId);
  const body = listLabelsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

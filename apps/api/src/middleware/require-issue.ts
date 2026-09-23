import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as issuesRepository from "../modules/issues/issues.repository.js";
import { AppError } from "../shared/errors.js";

const issueIdSchema = z.uuid();

/**
 * Same shape as requireProject, one level deeper: req.ctx.issueId is only
 * populated once findById confirms :issueId resolves to an issue in the
 * project/org already established by requireOrgMembership/requireProject.
 * A 404 here — the version-conflict (409) case belongs to the repository's
 * update transaction, not this middleware. Must run after requireProject.
 */
export async function requireIssue(req: Request, _res: Response, next: NextFunction) {
  if (!req.ctx?.projectId) {
    throw new Error("requireIssue must run after requireProject");
  }

  const parsedIssueId = issueIdSchema.safeParse(req.params.issueId);
  if (!parsedIssueId.success) {
    throw new AppError("invalid_issue_id", 400, "issueId must be a UUID.");
  }
  const issueId = parsedIssueId.data;

  const issue = await issuesRepository.findById(req.ctx.organizationId, req.ctx.projectId, issueId);
  if (!issue) {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }

  req.ctx = { ...req.ctx, issueId };
  next();
}

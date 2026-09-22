import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as organizationsRepository from "../modules/organizations/organizations.repository.js";
import { AppError } from "../shared/errors.js";

const organizationIdSchema = z.uuid();

/**
 * The actual fix for the "hardcoded org id" problem: req.ctx is only ever
 * populated from a real membership row, never trusted from the URL alone.
 * A client can put any organizationId in the path, but only gets past
 * this middleware — and req.ctx.organizationId only ever holds a value —
 * if req.auth.userId really is a member of it. Must run after requireAuth.
 */
export async function requireOrgMembership(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    throw new Error("requireOrgMembership must run after requireAuth");
  }

  const parsedOrganizationId = organizationIdSchema.safeParse(req.params.organizationId);
  if (!parsedOrganizationId.success) {
    throw new AppError("invalid_organization_id", 400, "organizationId must be a UUID.");
  }
  const organizationId = parsedOrganizationId.data;

  const membership = await organizationsRepository.findMembership(
    req.auth.userId,
    organizationId,
  );

  if (!membership) {
    throw new AppError("not_a_member", 403, "You are not a member of this organization.");
  }

  req.ctx = { userId: req.auth.userId, organizationId, role: membership.role };
  next();
}

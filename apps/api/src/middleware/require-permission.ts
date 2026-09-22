import type { NextFunction, Request, Response } from "express";
import { hasPermission, type Permission } from "../shared/permissions.js";
import { AppError } from "../shared/errors.js";

/**
 * Must run after requireOrgMembership — checks the resolved role against
 * the permission map. A factory (not the middleware itself) so each route
 * can name the one permission it actually needs.
 */
export function requirePermission(permission: Permission) {
  return function requirePermissionMiddleware(req: Request, _res: Response, next: NextFunction) {
    if (!req.ctx) {
      throw new Error("requirePermission must run after requireOrgMembership");
    }
    if (!hasPermission(req.ctx.role, permission)) {
      throw new AppError("forbidden", 403, "You don't have permission to do that.");
    }
    next();
  };
}

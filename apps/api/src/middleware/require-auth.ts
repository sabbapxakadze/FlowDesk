import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/tokens.js";
import { AppError } from "../shared/errors.js";

/**
 * "Who is making this request" — nothing about what they're allowed to
 * do (that's requireOrgMembership + requirePermission, run after this).
 * A synchronous throw here is caught by Express automatically, same as
 * any handler — no manual try/catch-and-forward needed.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("unauthenticated", 401, "Missing or invalid Authorization header.");
  }

  const token = header.slice("Bearer ".length);
  try {
    const { userId } = verifyAccessToken(token);
    req.auth = { userId };
    next();
  } catch {
    throw new AppError("unauthenticated", 401, "Invalid or expired access token.");
  }
}

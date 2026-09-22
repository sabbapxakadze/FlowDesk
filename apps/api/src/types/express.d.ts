import type { Role } from "../shared/permissions.js";

/**
 * req.auth is set by requireAuth (just "who is making this request").
 * req.ctx is set by requireOrgMembership, one step later — it only ever
 * exists once a real membership row has been found, never derived from
 * the URL alone. Both stay optional here: TypeScript has no way to know
 * statically that a given route actually ran these middlewares first, so
 * every handler that expects them still needs its own runtime check.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
      ctx?: { userId: string; organizationId: string; role: Role };
    }
  }
}

export {};

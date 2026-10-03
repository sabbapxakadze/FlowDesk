import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requirePermission } from "../../middleware/require-permission.js";
import * as auditController from "./audit.controller.js";

export const auditRouter: RouterType = Router();

// Owners and admins only (view_audit_log). requireOrgMembership keeps other organizations out and
// the query is scoped by the organization id.
auditRouter.get(
  "/organizations/:organizationId/audit-events",
  requireAuth,
  requireOrgMembership,
  requirePermission("view_audit_log"),
  auditController.list,
);

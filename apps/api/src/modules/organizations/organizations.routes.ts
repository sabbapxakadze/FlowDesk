import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requirePermission } from "../../middleware/require-permission.js";
import * as organizationsController from "./organizations.controller.js";

export const organizationsRouter: RouterType = Router();

// Any member may see who else is in the organization (the assignee picker needs
// it); requireOrgMembership is what keeps other organizations out.
organizationsRouter.get(
  "/organizations/:organizationId/members",
  requireAuth,
  requireOrgMembership,
  organizationsController.listMembers,
);

// Owners and admins only (manage_members); the rules about WHOM they may touch are in
// the service (not yourself, never the owner). See ADR 0024.
organizationsRouter.patch(
  "/organizations/:organizationId/members/:userId",
  requireAuth,
  requireOrgMembership,
  requirePermission("manage_members"),
  organizationsController.changeRole,
);
organizationsRouter.delete(
  "/organizations/:organizationId/members/:userId",
  requireAuth,
  requireOrgMembership,
  requirePermission("manage_members"),
  organizationsController.removeMember,
);

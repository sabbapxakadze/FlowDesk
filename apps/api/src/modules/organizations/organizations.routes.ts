import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
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

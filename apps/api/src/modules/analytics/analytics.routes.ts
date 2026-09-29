import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requireProject } from "../../middleware/require-project.js";
import { requirePermission } from "../../middleware/require-permission.js";
import * as analyticsController from "./analytics.controller.js";

export const analyticsRouter: RouterType = Router();

// view_issue, no new permission: analytics reads the same data everyone
// who can already view a project's issues can see.
analyticsRouter.get(
  "/organizations/:organizationId/projects/:projectId/analytics/throughput",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  analyticsController.getThroughput,
);

analyticsRouter.get(
  "/organizations/:organizationId/projects/:projectId/analytics/cycle-time",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  analyticsController.getCycleTime,
);

analyticsRouter.get(
  "/organizations/:organizationId/projects/:projectId/analytics/velocity",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  analyticsController.getVelocity,
);

analyticsRouter.get(
  "/organizations/:organizationId/projects/:projectId/analytics/breakdown",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  analyticsController.getBreakdown,
);

import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requireProject } from "../../middleware/require-project.js";
import { requirePermission } from "../../middleware/require-permission.js";
import * as issuesController from "./issues.controller.js";

export const issuesRouter: RouterType = Router();

// Nested under both organization and project: requireAuth -> who are you,
// requireOrgMembership -> are you in this org, requireProject -> does
// :projectId actually belong to that org, requirePermission -> does your
// role allow this action. Same chain shape as projects.routes.ts, one
// link longer.
issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  issuesController.listIssues,
);

issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/issues",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("manage_issue"),
  issuesController.createIssue,
);

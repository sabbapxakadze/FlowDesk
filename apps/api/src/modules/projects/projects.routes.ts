import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requirePermission } from "../../middleware/require-permission.js";
import * as projectsController from "./projects.controller.js";

export const projectsRouter: RouterType = Router();

// Nested under the organization deliberately, not a flat /projects — the
// URL should say the same thing the repository layer enforces: this list
// is scoped to a tenant. See docs/adr and CLAUDE.md's tenant-isolation rule.
//
// requireAuth -> requireOrgMembership -> requirePermission, in that order:
// who are you, are you even a member of this org, does your role allow
// this specific action. No manual .catch(next) anywhere here: Express 5
// natively awaits a handler's or middleware's returned promise and
// forwards a rejection to the error middleware.
projectsRouter.get(
  "/organizations/:organizationId/projects",
  requireAuth,
  requireOrgMembership,
  requirePermission("view_project"),
  projectsController.listProjects,
);

projectsRouter.post(
  "/organizations/:organizationId/projects",
  requireAuth,
  requireOrgMembership,
  requirePermission("manage_project"),
  projectsController.createProject,
);

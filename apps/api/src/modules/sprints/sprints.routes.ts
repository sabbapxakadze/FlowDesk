import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requireProject } from "../../middleware/require-project.js";
import { requireSprint } from "../../middleware/require-sprint.js";
import { requirePermission } from "../../middleware/require-permission.js";
import * as sprintsController from "./sprints.controller.js";

export const sprintsRouter: RouterType = Router();

// Sprints reuse the existing issue permissions (view_issue/manage_issue) —
// same reasoning as labels: sprints only exist to organize issues, and
// CLAUDE.md's permission map is deliberately kept small.
sprintsRouter.get(
  "/organizations/:organizationId/projects/:projectId/sprints",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  sprintsController.listSprints,
);

sprintsRouter.post(
  "/organizations/:organizationId/projects/:projectId/sprints",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("manage_issue"),
  sprintsController.createSprint,
);

sprintsRouter.patch(
  "/organizations/:organizationId/projects/:projectId/sprints/:sprintId/start",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireSprint,
  requirePermission("manage_issue"),
  sprintsController.startSprint,
);

sprintsRouter.patch(
  "/organizations/:organizationId/projects/:projectId/sprints/:sprintId/complete",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireSprint,
  requirePermission("manage_issue"),
  sprintsController.completeSprint,
);

// Rename: same permission as the rest of sprint management.
sprintsRouter.patch(
  "/organizations/:organizationId/projects/:projectId/sprints/:sprintId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireSprint,
  requirePermission("manage_issue"),
  sprintsController.renameSprint,
);

import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requirePermission } from "../../middleware/require-permission.js";
import * as labelsController from "./labels.controller.js";

export const labelsRouter: RouterType = Router();

// Org-level, not nested under a project — labels are a workspace-wide
// taxonomy (see the Phase 3 slice 3 plan's "Decisions" section). Reuses
// the existing issue permissions: labels only exist to tag issues, so no
// new permission was added for them.
labelsRouter.get(
  "/organizations/:organizationId/labels",
  requireAuth,
  requireOrgMembership,
  requirePermission("view_issue"),
  labelsController.listLabels,
);

labelsRouter.post(
  "/organizations/:organizationId/labels",
  requireAuth,
  requireOrgMembership,
  requirePermission("manage_issue"),
  labelsController.createLabel,
);

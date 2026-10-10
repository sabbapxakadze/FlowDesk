import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import * as myWorkController from "./my-work.controller.js";

export const myWorkRouter: RouterType = Router();

// requireOrgMembership only: these are always the caller's OWN issues (like the notifications), so there is no
// project or role to check, and the query is scoped by the organization and by the caller's id.
myWorkRouter.get(
  "/organizations/:organizationId/my-work/issues",
  requireAuth,
  requireOrgMembership,
  myWorkController.listAssigned,
);

myWorkRouter.get(
  "/organizations/:organizationId/my-work/week",
  requireAuth,
  requireOrgMembership,
  myWorkController.weekProgress,
);

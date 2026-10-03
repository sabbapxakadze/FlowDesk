import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { registerRateLimiter } from "../../middleware/rate-limit.js";
import * as invitationsController from "./invitations.controller.js";

export const invitationsRouter: RouterType = Router();

// Owners and admins only (manage_members). requireOrgMembership keeps other
// organizations out and every query is scoped by the organization id.
const manage = [requireAuth, requireOrgMembership, requirePermission("manage_members")];

invitationsRouter.get("/organizations/:organizationId/invitations", ...manage, invitationsController.list);
invitationsRouter.post("/organizations/:organizationId/invitations", ...manage, invitationsController.create);
invitationsRouter.delete(
  "/organizations/:organizationId/invitations/:invitationId",
  ...manage,
  invitationsController.revoke,
);

invitationsRouter.post(
  "/organizations/:organizationId/invitations/:invitationId/resend",
  ...manage,
  invitationsController.resend,
);

// Public: the invited person has no account yet. The token in the body is the
// authorization. Rate limited like registering, because accepting creates an account.
invitationsRouter.post("/invitations/preview", registerRateLimiter, invitationsController.preview);
invitationsRouter.post("/invitations/accept", registerRateLimiter, invitationsController.accept);

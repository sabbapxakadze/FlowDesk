import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import * as notificationsController from "./notifications.controller.js";

export const notificationsRouter: RouterType = Router();

// requireOrgMembership only, no requirePermission — these are always
// the caller's own notifications, never gated by a project/issue role
// the way viewing someone else's data would be. Same reasoning as
// search's org-scoped route: no :projectId in the path to check.

notificationsRouter.get(
  "/organizations/:organizationId/notifications",
  requireAuth,
  requireOrgMembership,
  notificationsController.listNotifications,
);

notificationsRouter.get(
  "/organizations/:organizationId/notifications/unread-count",
  requireAuth,
  requireOrgMembership,
  notificationsController.getUnreadCount,
);

notificationsRouter.patch(
  "/organizations/:organizationId/notifications/read-all",
  requireAuth,
  requireOrgMembership,
  notificationsController.markAllRead,
);

notificationsRouter.patch(
  "/organizations/:organizationId/notifications/:notificationId/read",
  requireAuth,
  requireOrgMembership,
  notificationsController.markRead,
);

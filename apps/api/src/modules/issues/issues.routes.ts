import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requireProject } from "../../middleware/require-project.js";
import { requireIssue } from "../../middleware/require-issue.js";
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

// Not nested under /issues — the resource is "the board," not an issue.
// Still lives in this module: same table, same scoping as every other
// issues query here (this module already owns labels/comments/events
// alongside issues themselves).
issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/board",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  issuesController.getBoard,
);

issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("view_issue"),
  issuesController.getIssue,
);

issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/issues",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("manage_issue"),
  issuesController.createIssue,
);

issuesRouter.patch(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.updateIssue,
);

issuesRouter.patch(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/move",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.moveIssue,
);

issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/labels",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("view_issue"),
  issuesController.listIssueLabels,
);

issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/labels",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.attachLabel,
);

issuesRouter.delete(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/labels/:labelId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.detachLabel,
);

issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/comments",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.createComment,
);

issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/events",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("view_issue"),
  issuesController.listIssueEvents,
);

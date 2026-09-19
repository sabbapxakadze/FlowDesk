import { Router, type Router as RouterType } from "express";
import * as projectsController from "./projects.controller.js";

export const projectsRouter: RouterType = Router();

// Nested under the organization deliberately, not a flat /projects — the
// URL should say the same thing the repository layer enforces: this list
// is scoped to a tenant. See docs/adr and CLAUDE.md's tenant-isolation rule.
//
// No manual .catch(next) here: Express 5 natively awaits a handler's
// returned promise and forwards a rejection to the error middleware. That
// wrapper was an Express-4-era necessity; on 5 it'd just be dead code.
projectsRouter.get("/organizations/:organizationId/projects", projectsController.listProjects);

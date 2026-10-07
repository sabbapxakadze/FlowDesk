import { Router, type Router as RouterType } from "express";
import { demoStartRateLimiter } from "../../middleware/rate-limit.js";
import * as demoController from "./demo.controller.js";

export const demoRouter: RouterType = Router();

// Public on purpose: a visitor has no account. `info` says whether the demo is offered; `start` makes the copy (rate limited, capped, and off
// unless DEMO_ENABLED=true; see demo.service.ts).
demoRouter.get("/demo/info", demoController.info);
demoRouter.post("/demo/start", demoStartRateLimiter, demoController.start);

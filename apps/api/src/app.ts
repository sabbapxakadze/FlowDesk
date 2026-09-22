import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";

/**
 * Split from index.ts so tests can exercise the real middleware chain
 * (supertest drives requests straight at this app, in-process) without
 * opening an actual network port. index.ts is now just the thing that
 * calls .listen() — nothing here does.
 */
export const app: Express = express();

app.use(requestLogger);
app.use(express.json());
app.use(cookieParser());

// Health check is intentionally unversioned — it's infrastructure, not API
// surface. Everything else lives under /api/v1.
app.use("/api", healthRouter);
app.use("/api/v1", projectsRouter);
app.use("/api/v1", authRouter);

// Must be registered after every route — see error-handler.ts.
app.use(errorHandler);

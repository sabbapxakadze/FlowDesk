import express from "express";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";

const app = express();

app.use(requestLogger);
app.use(express.json());

// Health check is intentionally unversioned — it's infrastructure, not API
// surface. Everything else lives under /api/v1.
app.use("/api", healthRouter);
app.use("/api/v1", projectsRouter);
app.use("/api/v1", authRouter);

// Must be registered after every route — see error-handler.ts.
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`flowdesk-api listening on http://localhost:${env.PORT}`);
});

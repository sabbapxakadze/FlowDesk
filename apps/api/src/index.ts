import express from "express";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./modules/health/health.routes.js";

const app = express();

app.use(requestLogger);
app.use(express.json());

app.use("/api", healthRouter);

// Must be registered after every route — see error-handler.ts.
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`flowdesk-api listening on http://localhost:${env.PORT}`);
});

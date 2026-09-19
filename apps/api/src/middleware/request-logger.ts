import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger.js";

/**
 * Attaches req.id (a UUID, generated fresh unless the caller already sent
 * one via X-Request-Id) and req.log (the pino logger, pre-bound with that
 * id) to every request. Every log line for a request carries its id, and
 * the error handler echoes it back to the client — so a bug report that
 * includes a request id can be traced straight to the matching log lines.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers["x-request-id"];
    const id = typeof existing === "string" ? existing : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
});

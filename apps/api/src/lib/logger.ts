import pino from "pino";
import { env } from "../config/env.js";

/**
 * Structured logging, not console.log. In development, pino-pretty makes the
 * output human-readable; in production it stays newline-delimited JSON so a
 * log aggregator can index it. See CLAUDE.md's "Logging" convention.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

import pino, { type DestinationStream } from "pino";
import { env } from "../config/env.js";

/**
 * Values that must never reach a log (ADR 0050): the login token and the cookies (the refresh token is one) that arrive on a request, and the
 * `Set-Cookie` that hands out a new refresh token on a response. Request logging prints the whole header set, and on a host like Render the
 * log is kept and read by other systems. The paths use pino's own syntax; a header name is lower case on a request.
 */
export const REDACTED_PATHS = ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'];

/**
 * Structured logging, not console.log. In development, pino-pretty makes the
 * output human-readable; in production it stays newline-delimited JSON so a
 * log aggregator can index it. See CLAUDE.md's "Logging" convention.
 * `destination` is for tests (a stream to read the output from).
 */
export function createLogger(destination?: DestinationStream) {
  const options = { level: env.LOG_LEVEL, redact: { paths: REDACTED_PATHS, censor: "[Redacted]" } };
  if (destination) return pino(options, destination);
  return pino({
    ...options,
    transport: env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } : undefined,
  });
}

export const logger = createLogger();

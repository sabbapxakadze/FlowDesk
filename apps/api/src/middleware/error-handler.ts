import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors.js";

/**
 * The single place a thrown error becomes an HTTP response. Every response
 * this produces has the same shape, so the frontend never has to guess what
 * an error body looks like. Anything that isn't an AppError is treated as a
 * bug: logged with its real stack, but never shown to the client verbatim —
 * an unexpected exception may contain details (a raw SQL error, a file path)
 * that shouldn't leak.
 *
 * Must be registered last, after every route.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express requires 4-arg signature to recognize this as an error handler
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    req.log.warn({ err, code: err.code }, "request failed");
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        requestId: req.id,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  req.log.error({ err }, "unhandled error");
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Something went wrong on our end.",
      requestId: req.id,
    },
  });
}

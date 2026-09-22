import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { env } from "../config/env.js";

/**
 * In-memory store — the default, and fine for one process. It resets on
 * restart and doesn't share state across multiple instances, which is
 * exactly why Redis is a "Later" stack item (see CLAUDE.md) rather than
 * pulled forward just for this.
 *
 * Same response shape as every other error in this app (see
 * shared/errors.ts / middleware/error-handler.ts) — a rate-limited
 * request shouldn't look different from any other rejected one.
 */
function tooManyRequests(req: Request, res: Response) {
  res.status(429).json({
    error: {
      code: "too_many_requests",
      message: "Too many attempts. Please try again later.",
      requestId: req.id,
    },
  });
}

/**
 * Skipped entirely under NODE_ENV=test — not a workaround, a standard
 * pattern. The whole test suite runs against one shared in-process app
 * (see app.ts), and legitimate tests in *other* files call /auth/register
 * and /auth/login for real, many times, well past any limit meant for a
 * real attacker. The mechanism itself (does express-rate-limit's config
 * actually 429 correctly) is proven separately, in rate-limit.test.ts, by
 * an isolated app that never goes through this skip.
 */
function skipInTest(): boolean {
  return env.NODE_ENV === "test";
}

// The classic brute-force target — kept strict.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: tooManyRequests,
});

// Spam account creation, not credential guessing — looser window is fine.
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: tooManyRequests,
});

// Prevents email-bombing an address via repeated reset requests.
export const passwordResetRequestRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: tooManyRequests,
});

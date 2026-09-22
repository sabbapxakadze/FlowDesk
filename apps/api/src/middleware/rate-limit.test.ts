import { describe, expect, it } from "vitest";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

/**
 * Deliberately NOT the shared app (see app.js) — its own rate limiters
 * are skipped under NODE_ENV=test (see rate-limit.ts) precisely because
 * other test files legitimately call /auth/register and /auth/login many
 * times against that shared app. This test builds its own tiny, isolated
 * app with a real (never-skipped) express-rate-limit instance, to prove
 * the actual mechanism — window, limit, 429 handler — works correctly,
 * without that proof depending on, or interfering with, anything else.
 */
function buildIsolatedRateLimitedApp() {
  const app = express();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 3,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: { code: "too_many_requests", message: "Slow down." } });
    },
  });
  app.get("/limited", limiter, (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("express-rate-limit wiring", () => {
  it("allows requests under the limit and rejects the one that exceeds it", async () => {
    const app = buildIsolatedRateLimitedApp();

    await request(app).get("/limited").expect(200);
    await request(app).get("/limited").expect(200);
    await request(app).get("/limited").expect(200);

    const fourth = await request(app).get("/limited").expect(429);
    expect(fourth.body.error.code).toBe("too_many_requests");
  });
});

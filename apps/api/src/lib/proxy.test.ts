import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { applyProxyTrust } from "./proxy.js";

/** Who the server thinks a visitor is, with and without a proxy in front (ADR 0046). The rate limiters key on `req.ip`. */

function appWithTrust(hops: number) {
  const app = express();
  applyProxyTrust(app, hops);
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe("proxy trust", () => {
  it("with nothing in front (0), X-Forwarded-For is ignored, so a visitor cannot pretend to be someone else", async () => {
    // Why: locally and in tests there is no proxy; trusting the header would let anyone dodge a rate limit by sending a different one each time.
    const res = await request(appWithTrust(0)).get("/ip").set("X-Forwarded-For", "203.0.113.50");
    expect(res.body.ip).not.toContain("203.0.113.50");
  });

  it("behind one proxy (1), the visitor is the address the proxy added, not the proxy itself", async () => {
    // Why: behind Render every request arrives from the proxy; without this every visitor would share one rate limit and one log address.
    const res = await request(appWithTrust(1)).get("/ip").set("X-Forwarded-For", "198.51.100.7");
    expect(res.body.ip).toBe("198.51.100.7");
  });

  it("behind one proxy, a forged leftmost address does not win: only the proxy's own entry is believed", async () => {
    // Why: a visitor can send their own X-Forwarded-For; the proxy appends the real address to it, and only that entry may be trusted.
    const res = await request(appWithTrust(1)).get("/ip").set("X-Forwarded-For", "203.0.113.50, 198.51.100.7");
    expect(res.body.ip).toBe("198.51.100.7");
  });
});

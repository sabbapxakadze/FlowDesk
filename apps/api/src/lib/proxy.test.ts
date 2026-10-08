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

  it("behind Render's real chain (3 hops: an internal proxy, Cloudflare, then the visitor), the visitor is the first address of the list", async () => {
    // Why: the live log showed `x-forwarded-for: visitor, 162.158.x.x (Cloudflare), 10.x.x.x (Render internal)`. With 1 hop the server would take
    // the internal 10.x address, so every visitor would share one rate limit; 3 reaches the visitor.
    const chain = "146.255.1.1, 162.158.1.1, 10.20.3.4";
    expect((await request(appWithTrust(1)).get("/ip").set("X-Forwarded-For", chain)).body.ip).toBe("10.20.3.4"); // the mistake we had
    expect((await request(appWithTrust(3)).get("/ip").set("X-Forwarded-For", chain)).body.ip).toBe("146.255.1.1");
  });

  it("behind Render's chain (3), an address the visitor forged at the front still does not win", async () => {
    // Why: each hop appends the address it saw, so a forged first entry only pushes the real chain to the right; the count from the server's end still lands on the real visitor.
    const forged = "9.9.9.9, 146.255.1.1, 162.158.1.1, 10.20.3.4";
    expect((await request(appWithTrust(3)).get("/ip").set("X-Forwarded-For", forged)).body.ip).toBe("146.255.1.1");
  });
});

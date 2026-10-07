import type { Express } from "express";

/**
 * How many proxies stand between the internet and this server (ADR 0046). Behind Render's proxy the connection's own address is the proxy's,
 * so every visitor would look like one address to the rate limiters, and `req.ip` would be useless in logs. With `hops` set to 1 Express takes
 * the visitor's address from the proxy's `X-Forwarded-For` header (the entry the nearest trusted proxy added). Leave it at 0 when nothing is in
 * front (local development, tests): then the header is ignored, so a visitor cannot pretend to be someone else by sending it.
 */
export function applyProxyTrust(app: Express, hops: number): void {
  app.set("trust proxy", hops);
}

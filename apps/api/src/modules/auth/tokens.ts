import { randomBytes, createHash } from "node:crypto";
// Default import, not named — Node's ESM loader statically detects a CJS
// module's named exports, and that detection misses jsonwebtoken's
// (unlike pino-http, where the fix was the opposite direction). A default
// import always works for CJS interop: it's the whole module.exports
// object, so jwt.sign / jwt.verify are just property access, no static
// detection involved.
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

/**
 * Pure crypto mechanics — no business rules, no database. Kept separate
 * from auth.service.ts so that file stays about orchestration, the same
 * layering instinct as everywhere else in this codebase.
 */

const ACCESS_TOKEN_TTL = "15m";

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): { userId: string } {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("Malformed access token payload");
  }
  return { userId: payload.sub };
}

/**
 * 256 bits of randomness, base64url-encoded so it's cookie-safe and
 * URL-safe with no extra encoding — used for refresh tokens, and (Slice 4)
 * email-verification and password-reset tokens too. Never stored raw; see
 * hashToken.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * sha256, not argon2 — this hashes 256 bits of already-random data, not a
 * human password. The threat here is a database leak, not brute-force
 * guessing, so a fast cryptographic hash is correct; argon2 would just be
 * slow for no benefit on every lookup. See ADR 0003.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

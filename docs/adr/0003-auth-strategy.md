# 0003 — Token authentication strategy

Status: Accepted — 2026-09-19

## Context

The project needs a production-grade auth story the owner can defend in detail,
not a single `POST /login` returning a long-lived token.

## Decision

- Argon2id for password hashing.
- Access token: JWT, ~15 minutes, held in memory in the SPA only.
- Refresh token: opaque random bytes, stored **hashed** in a `sessions` table,
  sent as an `httpOnly; SameSite=Lax; Secure` cookie scoped to the refresh path.
- Rotation on every refresh, with **reuse detection**: presenting an
  already-used token revokes the entire session family.
- Email verification and password reset use single-use hashed tokens with short
  expiry, and responses that do not reveal whether an account exists.

## Consequences

- XSS cannot read the refresh token (httpOnly) or persist the access token
  (memory only, lost on reload — a refresh call restores the session).
- CSRF risk on the refresh endpoint is mitigated by SameSite plus a narrow path.
- A database leak yields no usable refresh tokens, only hashes.
- Stolen-token replay is detected rather than merely expiring eventually.
- Cost: more moving parts, and a refresh-on-load step in the SPA bootstrap.

## Alternatives rejected

- **Access token in localStorage** — one XSS bug equals full account takeover.
- **Long-lived non-rotating refresh tokens** — theft is undetectable.
- **Server-side sessions only** — simpler and defensible, but teaches less about
  the token model that dominates current API design.

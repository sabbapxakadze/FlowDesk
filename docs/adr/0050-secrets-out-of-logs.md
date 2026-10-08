# 0050 - Secrets are redacted from the logs

Status: Accepted - 2026-10-08. Found while looking at the first live deploy (ADR 0049).

## Context

The request logger (`pino-http`) prints every request's full header set as structured fields. Nothing redacted them, so every API request logged the `Authorization: Bearer ...` access token and the `Cookie` header, and every login or refresh logged the `Set-Cookie` that hands out a new refresh token (valid 30 days). In development that stays on the owner's screen. On Render the log is kept and shown in a dashboard, so the secrets were being stored somewhere a session could be taken from. Found when the owner asked what happens if a full log line is pasted somewhere.

## Decision

`lib/logger.ts` now redacts three paths on every log line, through pino's own `redact` option (`REDACTED_PATHS`, censored as `[Redacted]`): `req.headers.authorization`, `req.headers.cookie` and `res.headers["set-cookie"]`. `createLogger(destination?)` builds the logger (a destination is for tests) and `createRequestLogger(logger)` builds the request middleware; the app uses the same ones as before. Everything else in the header set stays, including `x-forwarded-for`, which the rate limits and any investigation of them need.

## Tested

`middleware/request-logger.test.ts` sends a request carrying a Bearer token and a Cookie to a tiny app whose response sets a cookie, with the logger writing into a string: none of the three secrets appears, `[Redacted]` does, and the line still says `GET /ping 200` and still has the forwarded address. Emptying the redact list was caught by it.

## Limits, named

- Only these three places are covered. A secret that the app itself puts in a URL or a log message is not caught (none known: the OAuth callback carries a one-time `code` in its query string, which is logged in `req.url`; it is single-use and short-lived, but it is in the log).
- Lines written BEFORE this change still sit in Render's log with tokens in them, for as long as Render keeps them (not checked). The access tokens expired within 15 minutes; refresh tokens last 30 days. Mitigation for the owner's own account: "Sign out of all devices" on the Account page ends every session. Demo sessions end within 2 hours anyway.
- Not verified on the live site until it is redeployed.

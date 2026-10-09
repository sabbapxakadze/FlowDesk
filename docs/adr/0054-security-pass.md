# 0054 - The first security pass (Phase 9, slice 9.9)

Status: Accepted - 2026-10-09. The full findings, the secrets list and the rotation notes are in `docs/security.md`; this ADR records what was changed and why.

## Context

The app is public (Render), the repository is public (GitHub), and "Try the demo" is a public endpoint that writes data. Before showing it to strangers, the code, the configuration, the dependencies and the live site were reviewed once.

## Decisions

1. **Development tools pinned to patched versions (pnpm `overrides` in `pnpm-workspace.yaml`).** `pnpm audit` found 8 problems (3 critical, 3 high, 2 moderate), every one in a development tool (`handlebars`, `seroval`, `source-map-js`, `esbuild` inside `drizzle-kit`, `braces`), none in what runs in production: `pnpm audit --prod` is clean, and the built web app contains no trace of the flagged packages (the query devtools are loaded only when `import.meta.env.DEV` is true). They still run on the owner's machine and in CI, so seven were pinned to patched versions. After the change the audit lists one finding: `braces` (high, a stack-exhaustion denial of service on deeply nested glob patterns) has **no patched version**; it is reached only through `eslint-plugin-boundaries`' file matching on our own patterns, and is left.
2. **A password reset request no longer waits for the email.** For an account that exists the request waited for the mail provider (hundreds of milliseconds); for an unknown address it answered at once. The response was identical, but its TIME told an attacker which addresses are registered. The send is now started without waiting (with a `.catch` so a network error is logged, not an unhandled rejection). Test: a mail provider that never answers must not delay the request (it failed before the change). Not removed: the database write for a real account is a few milliseconds slower than the lookup alone, which is too small to measure over the network but is not zero.
3. **Left as they are, on purpose** (details in `docs/security.md`): registration answers "email already registered" (the usual trade-off; login and reset do not reveal it); no rate limit on the one-time-token confirm endpoints and on `/auth/refresh` (the tokens are long random values; a limit on refresh could log out people behind a shared address); `style-src 'unsafe-inline'` in the Content-Security-Policy (React's inline styles; scripts are by hash with no `unsafe-inline`); a minimum password length of 8 with no other rule; the in-memory rate limiters (correct for one instance, see 9.8).

## Checked, with what was seen

- **Repository (public):** no `.env` file was ever committed (only `.env.example`); a search of the whole git history for secret-looking values found only the throwaway CI values and `localhost` placeholders. This was a pattern search, not a full secret scanner.
- **Live site, read-only requests from a browser:** the private endpoints answer 401 without a login, an unknown API route and an unknown avatar answer a JSON 404, a malformed download link answers 400; `/.env`, `/.git/config` and `/apps/api/.env` return the app's HTML page (the single-page fallback), not files; source maps are not served (404); the response headers include a strict CSP (scripts by hash, `object-src 'none'`, `frame-ancestors 'none'`), HSTS for a year, `nosniff`, `no-referrer`, a `same-origin` opener policy and no `X-Powered-By`.
- **Code:** cookies are `httpOnly`, `SameSite=lax`, `Secure` outside development; uploads are limited to a type list with no HTML, SVG or script, served with the stored type plus `nosniff` (the type is client-supplied, so `nosniff` is what keeps a mislabelled file from being run); there is no CORS middleware (same origin only) and Socket.IO allows only `APP_URL`; unexpected errors answer a generic 500 and log the detail; the route list was read and every private route sits behind login (the membership checks were tested in earlier phases and not re-tested here).

## Not checked

Dashboards (GitHub, Render, Neon, Google) were not visible: see the owner's checklist in `docs/security.md`. No penetration test, no scan of the live site with a security scanner, no review of the dependencies' own code, no check that Neon's connection requires TLS.

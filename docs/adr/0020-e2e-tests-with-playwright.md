# 0020 — End-to-end tests: Playwright, as code, on isolated servers

Status: Accepted — 2026-10-01. Supplements the testing approach so far (API tests
with real Postgres; the web app checked by hand in a browser). Supersedes nothing.

## Context

The web app had no automated tests. Every UI slice was checked by hand through a
browser, and that is where the real bugs were found (a stuck palette after login,
a drag that became a click, a socket that died after a reload). Those are exactly
the kind API tests cannot see, and nothing stops them coming back.

## Decision

- **Playwright, tests as code.** Specs live in `e2e/tests/` and run with
  `pnpm test:e2e` (or `pnpm test:e2e:ui`). They do not depend on Claude or the MCP
  browser, which stays a tool for exploring a new feature. Playwright over Cypress
  mainly because realtime features need two logged-in users in one test (two
  browser contexts), and it is the owner's day-job tool. That comparison is from
  general knowledge, not checked against current docs.
- **Isolated servers.** `e2e/playwright.config.ts` starts its own API (port 4100)
  and web server (port 5273) through Playwright's `webServer`. The API gets
  `DATABASE_URL` = `TEST_DATABASE_URL` (`flowdesk_test`) and its own uploads folder,
  so a run never touches dev data and never collides with `pnpm dev` (4000, 5173).
  The Vite proxy target is read from `API_PROXY_TARGET` (default unchanged).
- **State.** One worker; the tables are truncated before every test (an auto
  fixture, same table list as the API tests' `resetDatabase`). A small `pg` helper
  in `e2e/support/db.ts` is for setup only, never for assertions about what the
  user sees.
- **Login** goes through the real login form, from a user registered through the
  real API.
- **Email.** The API is started with a dummy `RESEND_API_KEY`: registration still
  calls Resend, which rejects the key, and the API only logs that. Nothing is
  delivered and no real key is used. This does not replace the planned email fake.
- **Mode.** The API runs with `NODE_ENV=test`, which skips the rate limiters (the
  same switch the API tests rely on). First tried `development`, as `pnpm dev` uses,
  but register allows only 5 per hour per process and the fifth test got a 429.
  Side effect: in `test` mode the refresh cookie gets the `Secure` flag (as in
  production). Chromium accepts that on http://localhost and the reload test passes,
  so the session survives it.
- **Not in pre-push or `pnpm test` yet.** See Consequences.

## Consequences

- Needs a one-time browser install (`pnpm exec playwright install chromium`) and
  Postgres running, same as the API tests.
- A run takes about 21 seconds for 6 tests. Adding it to the Husky pre-push hook
  will make every push slower (browser, database, two servers). Decide later
  between everything on push, or a small smoke set on push and the full set in
  GitHub Actions.
- The test API logs the (expected) Resend 401 on every registration.
- Added dev dependencies at the repo root: `@playwright/test`, `pg`, `@types/pg`,
  `@types/node`.

## Alternatives rejected

- **Cypress.** Fine tool, but awkward for two users in one test.
- **Driving the browser through the MCP as the test suite.** Not repeatable, costs
  tokens, and only works while someone is there.
- **Running against the dev servers and dev database.** Resets would delete real
  local data; ports and state would collide.
- **A separate workspace package for `e2e/`.** More config for no benefit at this
  size.

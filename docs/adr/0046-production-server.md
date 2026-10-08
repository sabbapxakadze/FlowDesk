# 0046 - The production server: one process, migrations at start, proxy trust, a content policy, a clean stop

Status: Accepted - 2026-10-07. Phase 9 slice 9.1 (with 9.0, the test housekeeping). Builds on ADR 0045 (hosting on Render free).

## Context

Until now only development mode existed: Vite served the web app and proxied `/api` to the API. ADR 0045 puts both behind one address on Render. That needs the API process to serve the built web app, to know it sits behind a proxy, to bring its own database up to date (Render's pre-deploy command is not available on free web services), and to stop cleanly when Render replaces or sleeps it.

## Decision

- **The API process serves the built web app** when `SERVE_WEB=true` (`web-app.ts`). `vite build` now writes to `apps/web/build` (kept apart from `dist`, where `tsc -b` emits its own files, so the server only ever serves the real bundle; `build/` is git-ignored and ignored by lint). The server reads `index.html` once at start and **refuses to start if it is missing**. Files under `/assets` (hashed names) are cached for a year, other files for an hour; every address of the app (`/`, `/login`, `/projects/WEB/issues/WEB-12`) answers with the page, never cached, so a deploy is picked up at once. A path with a file extension that matches no file is a real 404 (a missing script must not arrive as HTML). `/api` and `/socket.io` are never answered by the page. An unknown `/api/...` address is a JSON 404 (`not_found`), in every mode.
- **Security headers (helmet) with a strict Content-Security-Policy**, only when serving the web app: scripts only from this server plus the page's own inline script **by hash** (the small theme script in `index.html`; the hash is computed from the built page), no `eval`, styles `'self'` plus inline (React sets `style=` attributes), images `'self' data: blob:`, `connect-src` this server and its WebSocket address (taken from `APP_URL`), no framing, no plugins. `upgrade-insecure-requests` only for an https address. Also nosniff, HSTS and no `X-Powered-By`.
- **Zod runs "jitless" in the browser** (`apps/web/src/app/zod-config.ts`, imported first in `main.tsx`). Found by the production smoke test: Zod probes `new Function(...)` to speed parsing up, the policy refuses it, Zod falls back quietly, but the browser still reports a violation (a console error). The policy keeps no `unsafe-eval`; the speed difference does not matter at our size.
- **`TRUST_PROXY`** (number of proxies in front; nothing in front: 0; **Render: 3, not 1, see ADR 0051**): Express takes the visitor's address from `X-Forwarded-For` (`lib/proxy.ts`). Without it every visitor behind Render's proxy shares one address, so the rate limiters (login, register, demo start) would count everyone together. At 0 the header is ignored, so a visitor cannot dodge a limit by sending a different one.
- **Migrations run when the server starts** with `RUN_MIGRATIONS=true` (`db/run-migrations.ts`), before it accepts a request, under a Postgres advisory lock so two servers starting together take turns. The migrations folder is found relative to the file, so it works from `src/` (tsx) and `dist/` (built).
- **A clean stop** (`lib/shutdown.ts`, wired in `index.ts`): on SIGTERM or SIGINT it closes Socket.IO and the HTTP server (dropping idle keep-alive connections), then the database pool, exits 0, exits 1 if a step failed, and gives up after 10 seconds. The database client no longer closes the pool on a signal by itself (that pulled the database away from requests still being answered).
- **A fix found on the way:** a Windows-1252 ellipsis byte in `ProfilePage.tsx` ("Loading…") made the production bundler refuse the file (it shows as a broken character in the browser too). Replaced with a proper UTF-8 ellipsis.
- **`/api/health` stays free of the database**, so an uptime ping does not wake a sleeping Neon database.

## Tested

API tests over the real code: the page and deep links, cache headers, missing files and unknown API addresses, the policy (script hash, framing, WebSocket address, https upgrade), proxy trust (0 ignores the header, 1 uses the proxy's entry, a forged leftmost entry does not win), the shutdown (order, twice, a failing step, a hang) and the migration runner (safe repeated, concurrent, lock released). Deliberate breaks of three of them were each caught. **`pnpm test:e2e:prod`** builds everything and runs the built app exactly as Render will (`node dist/index.js`, `NODE_ENV=production`, rate limiters on) against the test database: headers and no policy violation on the landing page and the logged-in app, a hashed bundle cached for a year, a deep link, a 404 for a missing file and a JSON 404 for an unknown API address, a session that survives a reload, a live update over the WebSocket, and Try the demo.

## Trade-offs and limits, named

- The whole app is one 1.2 MB script (354 KB compressed); a visitor to the landing page loads all of it. Splitting it by route is a later optimisation, not measured here.
- `style-src` keeps `'unsafe-inline'` (React inline styles); scripts do not.
- A clean stop cannot save a request that outlives the 10 seconds, and a free Render instance that is put to sleep gets no more notice than it gives.
- Not verified: how Render actually delivers SIGTERM and for how long it waits; behaviour behind Render's real proxy (the `X-Forwarded-For` shape is taken from the standard, not seen there); Safari and Firefox under the policy.

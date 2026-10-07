# 0044 - "Try the demo": a private, self-deleting demo per click

Status: Accepted - 2026-10-07. Builds on ADR 0039 (the demo data), 0042 (accounts without a password) and 0043 (the landing page).

## Context

The owner wanted a "Try the demo" button on the landing page where every click gives the visitor fresh data, and wanted that to hold after going live, not only in development. Three shapes were considered with the owner:

- **One shared demo account, reset on every click.** Simplest, but visitors overlap: one click resets the data under another visitor's hands, whatever one visitor renames or deletes is what the next one sees, and the login is a known email and password (ADR 0039 already noted that the demo owner's password change was not guarded).
- **One shared read-only demo.** Safe, but nobody can try dragging, creating or commenting.
- **A private copy per click** (chosen).

## Decision

- **One server endpoint decides everything; the button only calls it.** `GET /api/v1/demo/info` (public) answers `{ enabled, ttlMinutes }`; the landing page draws the button and its "deleted after about N hours" sentence only when `enabled` (never a dead button). `POST /api/v1/demo/start` (public, rate limited) makes the copy and answers like a login (an access token, the refresh cookie, the user, the organization).
- **The copy** is the ADR 0039 demo data (five people, three projects, 76 issues, comments with mentions, events, notifications, sprints, audit rows) built by the same engine, `db/seed-demo.ts`, now parameterised: `seedDemo` (the script) keeps its fixed identity and password; `createDemoCopy` uses a random suffix for the five emails (`alex.k3f9a2@demo.flowdesk.test`) and the slug (`demo-k3f9a2`), and **no password at all** (`password_hash` has been nullable since ADR 0042), so nobody can log in to a copy by guessing; it is entered only through the session the server issues. A user belongs to one organization today, so each copy has its own five users.
- **Marking and expiry.** `organizations.demo_expires_at` (migration 0029, indexed); null means a real organization. A copy expires `DEMO_TTL_MINUTES` (default 120) after it is made. The session carries it (`organization.demoExpiresAt`), so the app can say when it ends.
- **Expiry is enforced, not only cleaned up.** (1) `deleteExpiredDemos` removes expired copies, their rows and their users every time someone starts a demo. (2) Because that runs only on a start, the server also **refuses an expired copy by itself**: `requireOrgMembership` answers 403 `demo_expired` for any request into it, and a login, refresh or new session for it answers 401 `demo_expired`. So "deleted after N hours" holds for what a visitor can do on a quiet site, not only for the rows.
- **Start order** (`demo.service.ts`): off unless `DEMO_ENABLED=true` (404 `demo_disabled`), delete expired copies, if `DEMO_MAX_ACTIVE` (default 40) copies are alive answer 503 `demo_busy`, build the copy, sign in as its owner (`startSessionFor`). The route has its own rate limit: 5 starts per hour per address (`demoStartRateLimiter`, skipped under NODE_ENV=test like the others).
- **What a demo copy may not do** (`modules/demo/demo.guard.ts`, answered 403 `demo_restricted` before anything else runs, so an upload body is never even read): invite or re-send an invitation (they send email to any address), change the email, change or set a password, connect a Google or GitHub account, upload a file or a profile photo (storage), and create more than 300 issues. Deleting and editing inside the copy stays allowed: it is theirs. **Any new feature that sends email, stores files or changes who an account is must be guarded the same way**, or a demo visitor can use it.
- **Web.** `entities/demo` (the info query, the start call, the wording of a lifetime), `features/try-demo` (the button, the note under the buttons, `useEnterDemo`: start, sign in and fade to My work with `withViewTransition`, then run `onStarted`), the landing page's hero and closing block (a third button; the page layer passes `startAppTour("WEB")` so the guided tour opens by itself, because features never import each other), and `widgets/demo-bar` in the app shell: for a demo session only, "This is a demo with sample data. It is deleted at 14:32 (1 h 40 min left)." counting down, and when the time is up "This demo has ended" with "Start a new demo". A real organization never shows the bar.
- **Settings**: `DEMO_ENABLED` (off unless "true"), `DEMO_TTL_MINUTES`, `DEMO_MAX_ACTIVE`, documented in `.env.example`; the tests and the e2e API turn it on.

## Measured

Making a copy and signing in takes about 0.2 to 0.3 seconds against the local test database (the API tests that make one, with a few requests on top, take 220 to 360 ms). Over a network database it will be longer; the button shows "Preparing your demo…" while it waits. Not measured: memory and disk per copy at scale, or behaviour with many copies alive at once.

## Trade-offs, named

- A copy is several hundred rows plus five users. The cap and the per-address limit exist for that reason; a determined flood still costs rows until the cap is reached.
- The cap is soft: requests arriving in the same instant can overshoot it by a few (no lock), which the rate limit keeps small.
- The rate limiter is in memory: it resets when the server restarts and is not shared between servers (the Redis item in Phase 9). Behind a reverse proxy the per-address limit needs the proxy's real client address, which was not checked here.
- The clean-up runs only when someone starts a demo, so an idle site keeps its expired copies' rows until the next start (they are already refused). A scheduled job is a Phase 9 item.
- Real-time rooms are per organization, so copies do not see each other's live updates; the socket join does not check the expiry (it only delivers events to someone whose REST calls are already refused).
- The email addresses `*@demo.flowdesk.test` are reserved by convention (`.test` is never a real domain), so a copy's people cannot collide with a real signup.
- Password reset by email for a demo user was not guarded: the address is not real, nothing is delivered, and no demo user has a password to reset to anything useful.

## Not verified

Behaviour behind a real production reverse proxy; that email is truly never sent from a demo on a live provider (the invitation and email-change routes are refused before any sending code runs, tested over HTTP); Safari and Firefox for the new landing buttons and the bar.

## Alternatives rejected

One shared account reset on click, and a shared read-only demo (above); a "demo user" flag on users instead of on the organization (a copy's organization is what expires and is deleted; users follow it); resetting only when the next visitor arrives (it would still wipe a visitor who is mid-way).

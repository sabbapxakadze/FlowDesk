# 0038 - Session renewal, and signing out the inactive

Status: Accepted - 2026-10-06. Amends ADR 0003 (the "refresh on load" step).

## Context

Left in the background for a while, a tab showed errors such as "Failed to load invitations: Invalid or expired access token." until it was reloaded.
Cause (read in the code and reproduced): the access token lives 15 minutes and only in memory; the refresh cookie lives 30 days; and the web app called
`/auth/refresh` exactly once, when the page loaded. Nothing renewed the token after that and nothing retried a rejected request, so every request
failed once the token aged out, and returning to the tab (TanStack refetches on focus) made it visible. A reload worked because it refreshes.
The browser's own "Failed to fetch" is a different case: a request that got no answer at all.

## Decision

- **One place renews the token** (`shared/auth/session-refresh.ts`). It runs on page load, when a request is answered 401 `unauthenticated`, and when a tab
  returns to the foreground with a token older than 10 minutes.
- **A rejected request is renewed and sent once more** (`shared/api/client.ts`, `sendWithRenewal`): the 401 is never shown; the request is repeated with the new token. The auth
  endpoints are never retried, a request is retried at most once, and several requests failing together share one renewal.
- **The server's rule drives the care taken.** Refresh rotates the token, and a spent token presented again revokes the whole session on every device (ADR 0003). So the same
  cookie is never sent twice: one refresh at a time within a tab, and across tabs a Web Lock (`navigator.locks`), because tabs share the cookie. A tab that waited for the lock
  then refreshes with the cookie the other tab just received, which is a valid rotation.
- **The socket** follows: a handshake refused for a missing or expired token is not retried by socket.io, so the client renews (at most every 30 seconds) and connects again,
  and a background renewal reconnects a socket that is down.
- **Network failures** read "Could not reach the server. Check your connection and try again." instead of "Failed to fetch" (`ApiError` with code `network_error`, status 0, so queries still retry).
- **A session that is really gone** (30 days, revoked, signed out on another device) signs the person out locally and the login page says "Your session ended. Please log in again."
  A first-time visitor's refresh finding no cookie is not a lost session and shows nothing.
- **Inactivity logout.** After 30 minutes without the person's own input (pressing, typing, touching, moving, scrolling; not background traffic) a dialog says they will be signed out in 60 seconds, with
  "Stay signed in" and "Sign out now". At zero the session is ended and revoked on the server and the login page says "You were signed out because of inactivity." The numbers are constants in
  `shared/auth/idle-config.ts`. The last activity is shared between tabs through localStorage, so working in one tab keeps the others quiet; everything is computed from timestamps, so a slept background tab
  is still right when it wakes.

## Trade-offs, named

- A refresh whose answer is lost on the network cannot be retried (the cookie was already rotated), so it ends the session. Rare, and the safe side of the server's rule.
- The idle limit applies on every device, including a private computer; there is no "remember me" and no setting yet. 30 minutes is a starting value.
- Idle time in a hidden tab is checked about once a minute by the browser, so the sign-out can come up to a minute late.
- With localStorage blocked, activity is tracked per tab only.
- A person who is reading a long page without touching anything for 30 minutes sees the warning; one click keeps them signed in.
- The Web Lock is a fallback-free best effort: in a browser without it, two tabs expiring in the same instant could still collide.

## Alternatives rejected

- Renewing on a timer a little before expiry: a background tab's timers are throttled, so it would still miss; renewing on a 401 and on return covers every case with less code.
- Reloading the page when a request fails: loses what the person was doing and does not fix the cause.
- Only the 401 retry, without renewing on return: works, but a screen's queries all fail and retry at once on every return; renewing first avoids the burst.

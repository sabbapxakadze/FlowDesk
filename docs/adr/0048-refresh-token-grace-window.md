# 0048 - A short grace window for a refresh that raced itself

Status: Accepted - 2026-10-07. Amends ADR 0003 (refresh rotation with reuse detection) and builds on ADR 0038 (session renewal).

## Context

ADR 0003: every refresh swaps the refresh token for a new one, and presenting an already-spent token is treated as theft: the whole token family is revoked.

The first CI run (ADR 0047) failed one browser test: the page after a login showed the Log in page. The trace of that test showed the sequence: a full page load of `/projects` sent `POST /auth/refresh`; the test then navigated to `/profile` while that request was still unanswered (800 ms or more on GitHub's slower machine), so the browser cancelled it; the `/profile` page sent its own refresh with the cookie it still held and got 401.

The likely mechanism (inferred, the cancelled request has no response in the trace): the server had already rotated the token, the browser dropped the answer with the new cookie, and the old token was presented again. Reuse detection cannot tell that from theft. It is not only a test problem: a person who reloads or follows a link while a refresh is in flight (easy when a sleeping free server is slow to wake) would be signed out the same way.

## Decision

A spent token is **not** treated as theft when both are true:

1. it was spent by a normal rotation **less than 10 seconds ago** (`REFRESH_REUSE_GRACE_MS`), and
2. its family **still has a live session** (not revoked, not expired).

Then the refresh is answered like a normal one: a new token is issued in the same family, and the family is left alone. In every other case the old rule stays: the family is revoked and the request fails.

- Condition 2 is what keeps logout, logout-all and a password change final: they revoke every live token of the family, so a replay right afterwards finds no live session and is refused, grace window or not.
- The replayed token is **not marked spent again**, so its spent time does not move: replaying every few seconds cannot keep the window open.

## Trade-offs, named

- **A stolen token replayed within 10 seconds of the real rotation gets a session.** Before, the replay would have ended the whole family. Ten seconds is short, and the thief needs the old token during exactly that window; after it the old rule applies again.
- **A raced replay leaves two live tokens in the family** (the one the browser never received, and the new one). The unreceived one stays valid until it expires (30 days) or the family is revoked. Its only holder is the browser that lost the answer, so this is a small, bounded exposure that I did not remove (revoking it would need to know which token the browser kept).
- 10 seconds is a judgment, not a measured value. The observed gap in the CI trace was under one second.
- A second concurrent tab using the old cookie in the same instant is now also answered. That is the intended case (ADR 0038 already covers tabs sharing one cookie).

## Tested

`auth.session.test.ts`: a token rotated long ago still kills the family (the old test, now with the rotation aged by a minute, no sleeping); a token rotated a moment ago is answered and the session continues; the replay does not move the spent time; a replay right after logout is refused. Mutation checks (see the roadmap): removing the live-family condition, re-marking the token spent, and removing the time limit were each caught.

## Not verified

That this is what happened on GitHub's machine: the trace shows the cancelled request and the 401 that followed, not the server's side of it. The proof is the next CI runs: the same shard should stop failing. One green run is weak evidence, so re-run it a few times.

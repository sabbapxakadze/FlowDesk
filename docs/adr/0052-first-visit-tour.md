# 0052 - The guided tour starts by itself on a person's first visit

Status: Accepted - 2026-10-09. Builds on ADR 0040 (the tour) and ADR 0044 (the demo already starts it).

## Context

The guided tour (ADR 0040) only started from the Tutorial row in the sidebar, or by itself in the demo. A person who registered normally was never shown around unless they found the row (the owner noticed this on the live site). New people should be shown around once, without being nagged.

## Decision

- **Who:** anyone whose account has never had the tour started on its own: a new registration, a new Google or GitHub account, and a person who accepts an invitation. Skip and Esc stay; the Tutorial row replays it.
- **Where it is remembered:** a nullable `users.tour_seen_at` (migration 0030), on the account and not in the browser, so another device, a cleared browser or a reload never replays it. The profile-card dismissal (ADR 0028) is the same kind of flag.
- **When it is marked:** the moment the tour starts, not when it ends, so closing the tab halfway through does not bring it back.
- **Existing accounts:** the migration sets `tour_seen_at = now()` for every account that exists when it runs (a hand-added `UPDATE` after the generated `ALTER TABLE`), so nobody who already uses the app suddenly gets a tour. Demo copies and the seeded demo people are created already marked (the demo starts its own tour).
- **API:** `GET /users/me/tour` answers `{pending}`, `POST /users/me/tour/seen` marks it (idempotent, keeps the first time). They sit in the `profiles` module beside the profile card's two endpoints; a flag on the user is not worth a module. The flag is not part of the session user, so the auth contract, the login responses and the OAuth code are unchanged.
- **Web:** `FirstTour` (`features/app-tour`), mounted once in `AppShell`, renders nothing: when the answer is `pending` and the person's projects have loaded, it marks the tour seen and starts it (through the first project when there is one). A per-page-load set stops the double run React makes in development.

## Tests

API: a new account is pending, stays marked after login again, a second mark keeps the first time and another person's flag is untouched, both endpoints need a login. Browser: a new account sees the tour on its first visit, Esc ends it, and neither a reload nor logging out and in brings it back (the test fails when the "mark seen" call is removed). The e2e fixtures mark their own users as toured (`markTourSeen`, and `addOrgMember` inserts people already marked), because the overlay would otherwise sit over every test that is not about the tour.

## Not verified, and trade-offs

- Whether a tour that opens on its own feels pushy: Skip and Esc are always there, and there is no "never show tours" setting.
- An invited person gets the tour too (decided with the owner). A person who registers and never opens the app is shown it on their first visit, whenever that is.
- If the "mark seen" request fails (offline at that moment), the tour can start again on the next visit. Accepted: it is a repeat of a harmless tour.
- Nothing records who finished it, as before.

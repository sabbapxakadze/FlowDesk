# 0029 — Motion

Status: Accepted — 2026-10-04.

## Context

Apart from dragging cards, the app had no motion: pages, the side panel, dialogs, dropdowns, rows appearing
and leaving and in-place edit forms all cut in a single frame. The owner asked for smoother transitions and
chose, from a live design pass (every option side by side on `/design-system`), what each interaction does.

## Decision

Rules for all of it: 120 to 220ms, one easing (`--motion-duration-fast|base|slow`, `--motion-ease-out` in
`app/index.css`), only opacity and transform change (a row opening or closing animates its height, padding
and the gap beside it), nothing ever delays an action (closing, saving and navigating happen at once; only
the unmount waits for an exit animation), and everything is off under `prefers-reduced-motion` (CSS classes
switch off, JS exit waits become zero through `exitMs`).

| Interaction | What it does |
|---|---|
| Page change | The new page fades in and rises 6px. Keyed by PATH only, so filters, sorts and `?issue=` do not replay it. |
| A list loading | Rows rise in one after another (40ms apart, the first 8 only). |
| Issue side panel | Slides in from the right while fading, slides out on close. The page behind is NOT dimmed (the owner tried a dim and wanted nothing behind the panel to change). Closing is immediate (focus returns, `inert`); only the unmount waits 220ms. |
| Dialogs | The native `<dialog>` fades and grows from 96% and back, and its backdrop fades, using `@starting-style` and `allow-discrete` (CSS only). |
| Dropdown | The notifications list fades and drops 4px, and fades out. |
| Rows | A created row opens up with a short accent flash; a deleted row closes up first. A new filter, sort or page of results is not a change. |
| Buttons | Sink slightly while pressed; a running request shows a spinner (`pending`), a saved one a tick (`done`). |
| In-place edit or confirm | Fades and rises as it opens. |
| Light/dark | Colours cross-fade over about 200ms. |

How: `shared/lib/motion.ts` (reduced-motion check, exit wait, stagger), `shared/ui/useExitPresence` (stay
rendered for an exit), `useAnimatedList` (turns a changing list into rows that are initial, entering,
leaving or stable, with a reset key for filters and paging) and `useRowMotion` (the open/close animation,
with the Web Animations API on the row itself: no wrapper element, no leftover styles).

## Consequences and findings

- Enter animations use fill mode `backwards`, not `both`: a lingering animation keeps its element on a
  compositing layer, and wrapped around a whole page it made drags measurably slower (p95 frame time 16.8ms
  to 49.9ms on a long list). Found by measuring, fixed, and written into `index.css`.
- With the e2e suite run under "reduce motion" (so ordinary tests never race animations), the person hover
  card lost its hover-intent delay, because `motion-reduce:transition-none` also removes the delay. It now uses
  `duration-0` and keeps the delay (a real bug for real reduced-motion users).
- Not animated: the board and sprints lanes keep dnd-kit's own motion; reordering by a sort; the search
  results while typing (a stagger per keystroke would feel slow).
- A true cross-fade between pages (View Transitions) needs React Router's data mode; the app uses declarative
  mode, where React Router does not support it. Not done.
- Dialog animation depends on `@starting-style` / `allow-discrete`; a browser without them cuts as before.
  Firefox support was not confirmed.
- React StrictMode runs the row effect twice in development, so a row can start its animation twice; the
  second one replaces the first and nothing shows.

## Alternatives rejected

- Dimming the page behind the side panel (tried, owner did not want it).
- A wrapper element per animated row (extra markup, shadows clipped permanently, children remounted).
- Animating every list including the lanes and search (conflicts with dnd-kit transforms, or too slow).

## Amended 2026-10-06: the theme change is a View Transition

The theme cross-fade (a `motion-theme-fade` class that animated the colours of every element for 200 ms) looked laggy on full pages and on the blur-heavy public pages. It now uses the browser's View Transitions API where it exists: one picture of the page before, one after, a 320 ms fade between them (`::view-transition-old/new(root)` in `app/index.css`; started in `shared/theme/theme-store.ts`). Browsers without the API keep the old class as a fallback; "reduce motion" still turns it all off.
Measured in headless Chromium (software rendering, so only the direction is meaningful, not the absolute numbers): on `/design-system` the old fade had 19 frames slower than 50 ms and a 27 ms average frame, the view transition none and 18.7 ms; on `/login` the very slow frames went from 4 to 0, but frames slower than 33 ms were not fewer (44 against 55 in 6 switches), because the blurred shapes are costly either way. Not measured on a real GPU or in Safari or Firefox.

After a successful login the login card cross-fades into the app with the same view transition (`withViewTransition` in `shared/lib/motion.ts`: the route change runs inside `document.startViewTransition`, with `flushSync` so React has applied it before the "after" picture; React Router's own `viewTransition` navigate option did not start one in this `<BrowserRouter>` setup, which a test showed). Creating an account has no navigation: its confirmation message fades and rises in (`motion-rise-in`). Not smoothed: signing in with Google or GitHub, which is a full page load.

Amended again 2026-10-07: pages that replace each other fade too. `FadeLink` (`shared/ui`) is a router link whose page change runs through `withViewTransition`, used for the Home button and the brand link on the auth pages and the Create account / Log in links on the landing page (a Ctrl or Cmd click, a new-tab click and a link with its own `target` keep the browser's behaviour). The router now has `useTransitions={false}` in `App.tsx`: by default React Router applies a navigation inside `React.startTransition`, which `flushSync` cannot force, and a test caught the fade sometimes starting while the OLD page was still on screen (the new h1 was not there yet). With the setting off, navigations render at once and the new page is in place when the fade starts (checked on three navigations; the app has no lazy routes or Suspense that would need transitions). Login and register (the card's own content fade) and the Login / Create account switch are unchanged.

Amended 2026-10-09: two more fades. **Logging out** now runs inside `withViewTransition` too (in `AuthContext.logout`, so the Log out button, the idle sign-out and the password-change sign-outs all fade), and `RequireAuth` redirects to `/login` through a small `RedirectToLogin` that navigates in a layout effect: with the router's own `<Navigate>` (a passive effect) the redirect came one step after the "after" picture was taken and the fade ended on a blank page (a test caught it). **Returning from Google or GitHub** fades the app in: the "Continue with…" button notes the trip in `sessionStorage` (`shared/auth/oauth-trip.ts`), and on the page load that follows, the first silent refresh signs in inside `withViewTransition`. A plain reload has no note and does not fade; where `sessionStorage` is blocked there is simply no fade. Not verified: how either fade feels on a real screen (tests check that the fade starts with the new page already in place), and that the fade works in Safari or Firefox.

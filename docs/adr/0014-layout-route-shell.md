# 0014 — The navigation shell is a layout route

Status: Accepted — 2026-09-30

## Context

The app had no shared navigation: pages linked to each other ad hoc, and the
notification bell was a fixed top-right button that overlapped page links.
Phase 3.6 always planned a persistent shell once there were enough screens.

## Decision

- **A React Router layout route** renders the shell and an `<Outlet />`; every
  authenticated route is a child of it. A single `<RequireAuth>` sits on the
  layout route instead of one wrapper per page, so a new page inherits both
  the shell and the auth guard by being added under it. Public pages (home,
  login, register, verify, forgot/reset password, `/design-system`) stay
  outside it and have no sidebar.
- **Layering (FSD):** the navigation content is `widgets/sidebar` (it reads
  the project list and the session, both allowed below a widget). The layout
  itself, `app/AppShell.tsx`, lives in `app` because it composes two widgets
  and the router. A widget may not import another widget, so the sidebar takes
  an `actions` slot and the shell puts the notification bell in it.
- **One layout is rendered at a time.** `AppShell` chooses between the desktop
  sidebar and a mobile top bar with a drawer using `matchMedia` (via
  `useSyncExternalStore`), instead of rendering both and hiding one with CSS.
  The bell subscribes to live notifications when it mounts, so mounting it
  twice would double every listener.
- **Pages keep their own `<main>`;** the shell adds none, so there is exactly
  one main landmark.
- **Current-page state matches the URL, except two deliberate cases:** the
  project's "Issues" link is also current on an issue page, and the project's
  own name never claims the page (its sub-links do). Those two use a plain
  `<Link>` with an explicit `aria-current`, because `NavLink` can only derive
  it from the URL.
- **Tokens:** five new semantic tokens for the shell (`--color-bg-sidebar`,
  `--color-text-sidebar`, `--color-text-sidebar-active`,
  `--color-bg-sidebar-active`, `--color-border-sidebar`). The sidebar is dark in
  light mode on purpose and separated by a border in dark mode.

## Consequences

- Every protected page now has navigation without any per-page change, and the
  four project pages (list, board, sprints, analytics) are reachable from
  anywhere. The in-page links were left in place; removing them is a later
  rollout decision.
- The bell no longer overlaps page content.
- Mobile gets a drawer instead of nothing (the prototype had hidden the
  sidebar on small screens, which would have left phones with no navigation).
- Measured, not assumed: sidebar text pairs pass 4.5:1 in both modes. The
  active item's background differs from the sidebar by only about 1.15:1 (light)
  and 1.3:1 (dark); the active item is also marked by brighter text
  (about 16:1 on the sidebar) and `aria-current`, so the state is not carried by
  the background alone.
- Not verified: real Tab-key order (focus rings were checked by focusing links
  programmatically), and behavior in browsers other than Chrome.

## Alternatives rejected

- **Wrapping each page in the shell by hand:** repeats the wrapper 8 times and
  a forgotten page silently has no navigation.
- **Rendering both layouts and hiding one with CSS:** simpler, but doubles the
  bell's subscriptions and puts an unused copy of the nav in the accessibility
  tree.
- **A collapsible desktop sidebar, breadcrumbs, a theme toggle:** not needed to
  fix the actual problem; can be added when a screen needs them.

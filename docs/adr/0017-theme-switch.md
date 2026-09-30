# 0017 — An app-wide theme switch on the existing `data-theme` mechanism

Status: Accepted — 2026-09-30

## Context

Dark mode existed since Phase 3.5 (the semantic token tier is redefined under
`prefers-color-scheme: dark` and under an explicit `data-theme` attribute), but
the only ways to change it were the operating-system setting or a temporary
switch on `/design-system` that reset when the page was left. The owner asked
for a real switch.

## Decision

- **Three choices: Light, Dark, System.** System means "no attribute", so the app
  follows the OS exactly as before; nobody who never touches the switch sees a
  change. Light and Dark set `data-theme` on `<html>`, which `semantic.css`
  already honours.
- **A small module-level store** (`shared/theme/theme-store.ts`) read through
  `useSyncExternalStore` (`useTheme`), the same pattern `AppShell` uses for
  `matchMedia`. No context provider, no new dependency.
- **Saved in `localStorage`** under `flowdesk-theme` (System = key removed). ADR
  0003 keeps tokens out of localStorage; a display preference is a different
  kind of data. Every storage call is in try/catch: if storage is blocked the
  theme still changes for the tab, it just is not remembered.
- **No flash on load.** A tiny inline script in `index.html` applies the saved
  value before the first paint. The key name is deliberately duplicated there
  and in the store, with a comment on both sides, because the script must run
  before any module loads.
- **Other tabs stay in step** through the `storage` event, including when
  storage is cleared.
- **The theme applies everywhere, including login and the design-system page.**
  A dark-mode user should not get a white login page. The switch itself lives
  in the sidebar footer (so also in the mobile drawer) and on the design-system
  page; both render the same `ThemeSwitch` (`shared/ui`, with a `sidebar` and a
  `default` look), so they cannot disagree.
- **`color-scheme`** is now set on `:root` (`light dark`, or `light` / `dark`
  under the explicit selectors), so the browser draws scrollbars, select
  dropdowns, date pickers and the file button to match a forced theme.

## Consequences

- Verified live with real clicks and real reloads: Dark on a light OS, System,
  and Light on a dark OS each set the attribute, the saved key, the background
  and `color-scheme`; a reload with React deliberately delayed already had the
  saved `data-theme` (no flash); a second tab followed a change and a clear; a
  `localStorage` that throws still switched the tab with no page error; the
  choice carried from the design-system page into the app; Enter on a focused
  button toggles it with a visible 2px focus ring; the drawer has the switch.
- Not verified: the browsers' own scrollbars and pickers by eye (the computed
  `color-scheme` was checked, not the pixels), Firefox and Safari, and a real
  private window.
- Out of scope, named: a per-user server-side preference, more than three
  options, scheduled themes.

## Alternatives rejected

- **A React context provider:** more ceremony than a 30-line store for a value
  read in two places.
- **Applying the theme only in an effect:** flashes the wrong colours on every
  load for anyone who chose a non-default theme.
- **Keeping login on System:** simpler to describe, worse to use.

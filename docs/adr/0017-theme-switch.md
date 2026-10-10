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

## Amended 2026-10-10: a lighter dark theme ("soft charcoal")

The owner found the dark theme too dark: the page was `neutral-950` (nearly black, lightness 0.145) and cards `neutral-900` (0.205), only 1.10 : 1 apart, with the sidebar the same black as the page. Four options were previewed side by side on `/design-system` with the real components (today's, a lighter neutral gray, a teal-tinted slate, and a clearly lighter "dimmed" one); the owner chose the **lighter neutral gray (option A)**. Still pure gray (chroma 0), as ADR 0016 chose for the light theme.

| Token | Before | Now |
|---|---|---|
| page | neutral-950 | neutral-900 (0.205) |
| card (surface) | neutral-900 | neutral-800 (0.269) |
| lane, selected sidebar row | neutral-800 | neutral-775 (0.32, new) |
| sidebar | neutral-950 | neutral-925 (0.16, new), now darker than the page |
| default border | neutral-800 | neutral-725 (0.35, new) |
| sidebar border | neutral-800 | neutral-750 (0.30, new) |
| control border | neutral-500 | neutral-475 (0.60, new) |
| chart grid lines | neutral-800 | neutral-725 (they would have vanished on the new cards) |

Five new gray stops were added to `primitives.css`; both dark blocks of `semantic.css` (the explicit dark theme and "follow my system") were changed alike; the light theme is untouched.

**Measured on the real values (WCAG contrast):** body text 16.4 / 13.9 / 11.6 : 1 on page / card / lane; muted text 6.9 / 5.8 / 4.9; accent (links, focus ring, chart bars) 7.4 / 6.2 / 5.2; warning 10.4 / 8.8 / 7.4; done green 9.3 / 7.8 / 6.6; sidebar text 7.5 and the selected row 11.6; the control border against a card 3.8. Cards against the page 1.19 : 1 (was 1.10).
**One pair is just under the line:** red error text directly on a lane is 4.4 : 1 (4.5 needed); on the page 6.2 and on a card 5.2 are fine. Red text was not found directly on a lane anywhere in the app (errors sit on the page, overdue markers on cards), so the red was left as it is.
**Not checked:** how it looks to a person on real screens in every part of the app (only the browser tests of the dark theme were run), and whether any screen draws a gray straight from the neutral scale instead of a semantic token (none was found by search).

**Follow-up the same day: the public pages keep the old black.** The landing page and the log in and create account pages draw soft coloured ribbons behind them. They glow against near black but look hazy ("foggy", the owner noticed) on the lighter gray. They now use a new token, `--color-bg-backdrop`: the same as the page in the light theme, and the previous near black (neutral-950) in the dark theme (both dark blocks). The app inside is unchanged. Checked: the landing page root and the log in page use the near black (computed colour, and the log in page by eye: deep black with the vivid teal, magenta and indigo glows); the landing page was NOT seen by eye after the change, because the browser tab was in use. The five dark-theme browser specs passed (71) while the change was being made.

## Amended again 2026-10-10 (later the same day): pulled back down a little

The soft charcoal above looked slightly hazy across the whole logged-in app ("a bit fog on the full screen", the owner). Nothing was layered over the page: a scan of every element and its
`::before` / `::after` in the real app found no overlay, filter, blur or gradient covering the screen, and the only `blur` rules are the login page's glass card and the aurora ribbons. It was
the colour itself: a lifted black reads as haze. Three versions were rendered side by side on the real board and My work pages (today's, a deeper one, and the colours from before the first
amendment); the owner saw the haze in today's and not in the deeper one, and chose it. Measured from the screenshots (sRGB levels of 255): page 23 / 15 / 10, card 38 / 30 / 23, lane 51 / 42 / 38.

| Token | First amendment | Now |
|---|---|---|
| page | neutral-900 (0.205) | neutral-925 (0.17, was the sidebar's stop) |
| card (surface) | neutral-800 (0.269) | neutral-850 (0.235, new) |
| lane, selected sidebar row | neutral-775 (0.32) | neutral-790 (0.285, new) |
| sidebar | neutral-925 (0.16) | neutral-950 (0.145), still darker than the page |
| default border, chart grid | neutral-725 (0.35) | neutral-750 (0.30) |
| sidebar border | neutral-750 (0.30) | neutral-800 (0.269) |

`neutral-725` and `neutral-775` are gone from `primitives.css`; `925` changed value. Every dark background got darker and no text colour changed, so every text contrast can only have risen
(card against page is 1.19 before and about 1.15 now; the control border against a card goes from 3.8 to about 4.2). The new numbers were calculated, not re-measured in a browser.
The login, create account and landing pages are unchanged (`--color-bg-backdrop` is still `neutral-950`).

**Not done / not verified:** the landing page's product screenshots (`public/landing/*.jpg`, `pnpm landing:shots`) were taken in the previous charcoal and have not been retaken; whether the
haze is gone on every screen was judged by the owner on two pages (board, My work) only.

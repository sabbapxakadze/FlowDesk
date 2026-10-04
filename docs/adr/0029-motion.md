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

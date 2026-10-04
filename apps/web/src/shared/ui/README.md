# shared/ui

The design system. Knows nothing about the domain (no "Issue", no "Project"
in here). Consumes semantic design tokens only (`--color-*`, `--radius-*`
from `shared/tokens/semantic.css`) — see docs/adr/0006.

Built in Phase 3.5 (slice 3), once real screens existed to derive the base
set from instead of guessing: `Button`, `Input`, `Textarea`, `Select`,
`Field`, `Card`, `ErrorText`. Variants use `class-variance-authority`;
`lib/cn.ts` merges classes the shadcn way (`clsx` + `tailwind-merge`), so a
consumer's own `className` can override a variant's without a specificity
fight.

No Radix yet — nothing built so far needs a dialog, portal, or combobox.
Add the next component here when a real screen needs it, not before.

`Page` and `PageHeader` (Phase 3.6 slice 2d) are the frame of every logged-in
page. `PageHeader` imports react-router's `Link` for its back link, the one
router dependency in this library.

Buttons (Button cleanup slice, 2026-10-02): text that acts is `<Button variant="link">`
(or `buttonVariants({ variant: "link" })` on a `Link` or `a`); an icon-only button is
`IconButton` (its `label` is required). Lint fails on a hand-written link style and on a raw
`<button>` outside the short list in `eslint.config.js`.

`Avatar` shows a photo (`src`) or the person's initials; it falls back to initials when the picture is missing
or fails to load. Sizes: `sm` 20px, `md` 28px, `lg` 96px, `xl` 128px (profile pages). `PersonHover` shows
photo, job title, role, email and an optional "View profile" link, all passed in as plain props.

`Field` has an opt-in `reserveErrorSpace` for fields in an inline row (the three create forms): the error
line always exists, with a fixed height and no width of its own, so a validation message never moves a
neighbour or the button; `FieldRowAction` wraps the row's button so it lines up with the inputs' bottoms.
Stacked forms (login, register) leave it off so they get no permanent gap.

`Lane` (2026-10-04) is the panel a board column or a sprints-page list sits in: a shade apart from the page
(`--color-bg-lane`, lighter than the cards in dark mode), a fixed header, and a body that scrolls inside with the slim
always-visible scrollbar (`.scrollbar-list-always` in `app/index.css`; `.scrollbar-list` is the hover-only variant).
`shared/dnd/multiList` holds the drag logic shared by the board and the sprints page.

`ScrollPanel` (2026-10-04) is a list that grows inside its own scrolling area instead of stretching the page ("Load more"
goes inside it). Two looks on the surface's own background, no tint: `raised` (a thin outline and a soft outer shadow, the Issues list) and
`edges` (no box; a soft shadow and a thin line at the top once scrolled and at the bottom while more is hidden, CSS only via
`.scroll-edges`; a person's activity and the full issue page's timeline). `PersonHover`'s card is `position: fixed`
(placed from the name's measured position) so a scrolling list neither clips it nor becomes scrollable because of it.
`ScrollPanel` also takes `fitWindow` (the cap shrinks to the room left in the window, so the bottom edge is on screen) and a
`footer` (pinned to the bottom of the box, fully visible however far the list is scrolled: Load more on the profile).

Motion (ADR 0029): `Button` has `pending` and `done`; `Card` takes `rowState`/`rowIndex` for list rows; hooks `useExitPresence`,
`useAnimatedList`, `useRowMotion`/`useRowMotionProps` and `useSuccessFlash`; the `motion-*` classes are in `app/index.css`.

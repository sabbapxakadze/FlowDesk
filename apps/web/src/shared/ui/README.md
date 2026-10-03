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

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

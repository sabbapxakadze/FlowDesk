# 0006 — Feature-Sliced Design and a two-tier token system

Status: Accepted — 2026-09-19

## Context

`components/ hooks/ utils/` degrades into a junk drawer as an app grows, and
ad-hoc colour and spacing values make a product look amateur while making dark
mode nearly impossible to retrofit.

## Decision

**Structure** — Feature-Sliced Design: `app → pages → widgets → features →
entities → shared`, with imports flowing downward only, enforced by
`eslint-plugin-boundaries` as a build failure. The `processes` layer is not
used (removed in modern FSD).

**Styling** — Tailwind v4 with a two-tier token system. Primitives hold raw
values (`--color-blue-500`, `--space-4`); semantic tokens express intent
(`--color-bg-surface`, `--color-text-muted`, `--radius-card`). **Components
consume semantic tokens only.** Dark mode redefines the semantic tier alone.
shadcn/ui components are copied into `shared/ui` and rewritten onto our
semantic tokens.

## Consequences

- "Where does this code go?" has exactly one answer, checked by the linter.
- Theming is a ~20-variable change, not an audit of every component.
- A `/design-system` route documents the system and doubles as portfolio material.
- Cost: FSD carries real upfront ceremony and feels heavy in the first weeks.

## Alternatives rejected

- **Flat feature folders** — simpler, but no enforced import direction.
- **shadcn used as-is** — ships its own colour conventions that fight our tokens.
- **Components from scratch on Radix** — more learning, but 2–3 extra weeks.
- **CSS Modules** — strong fundamentals, slowest iteration, least relevant to
  the roles being targeted.

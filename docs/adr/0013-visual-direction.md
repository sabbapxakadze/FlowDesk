# 0013 — Visual direction: warm neutrals, slate-teal accent, serif for titles

Status: Accepted — 2026-09-30. The neutral scale (`stone`) is superseded by ADR 0016 (`neutral`); the accent, type pair and the swap-point decision stand.

## Context

Phase 3.6 shipped a deliberately plain palette (stock cool `gray`, deep-blue
accent) and deferred a real design pass until the feature set existed (ADR
0006's token tiers were built so this would be a value change, not a rewrite).
The feature set now exists. The owner compared three palettes in a throwaway
prototype (`docs/design/direction-prototype.html`) and chose palette A: warm
neutrals with a restrained slate-teal accent, inspired by the look of a
product they like, with Inter for text and a serif for titles. They also want
to be able to change the palette later.

## Decision

- **Neutrals** are Tailwind's built-in `stone` scale (warm), replacing `gray`.
  Light: page `stone-100`, surface white, text `stone-950`, muted
  `stone-600`. Dark: page `stone-950`, surface `stone-900`, text `stone-100`,
  muted `stone-400`.
- **Accent** is a desaturated slate-teal ramp (OKLCH hue ~200, low chroma) in
  `primitives.css`, keeping the existing `--color-accent-50..950` names.
  Light mode uses `accent-700` for links, in-progress and chart marks and
  `accent-600` for the focus ring; dark mode uses `accent-400`.
- **Type:** Inter (variable) for all UI text; Newsreader (variable, free,
  OFL) as `--font-display`, used only for page titles (`h1`) and the large
  stat numbers, at weight 400. Cards, lists and forms stay in Inter, because a
  serif in dense working UI hurts scanning.
- **Radii, spacing and component structure are unchanged.**
- **The swap point is the semantic tier.** A palette is just which primitive
  scale or shade each `--color-*` semantic token points at (plus the accent
  ramp). Changing palette = editing `semantic.css` / `primitives.css` and
  re-running the contrast check below. No component changes.

## Consequences

- A different palette later is a small, reviewable edit in two token files.
- Verified by measurement, not by eye: WCAG ratios read from the computed
  token colors in the browser, both modes. Text and link pairs pass 4.5:1,
  chart marks and the focus ring pass 3:1. Two pairs were below threshold and
  were fixed in this slice (`text-warning` 3.2 to 5.0 using `amber-700`;
  the to-do status dot 2.6 to 4.8 using `stone-500`). Both were already below
  threshold before this change.
- Known and NOT fixed: `border-input` on the surface is about 1.5:1 (light)
  and 1.7:1 (dark) against WCAG's 3:1 for UI component boundaries. It was the
  same before this change; fixing it makes every input visibly heavier, so it
  is left for the rollout slice to decide.
- The bare font name `"Inter"` in the old stack never matched fontsource's
  variable build (it registers as `"Inter Variable"`), so the app was very
  likely falling back to the system font. Both names are now listed.
- The fixed notification bell overlaps top-right page links on some screens;
  the persistent navigation shell (next slice) is what resolves that.

## Alternatives rejected

- **Keep the cool blue palette** (option B in the prototype): safe, but it is
  the generic look the owner wanted to move away from.
- **Indigo accent** (option C): livelier, but one strong colour competes with
  the status colours on the board.
- **Custom hex neutrals copied from the prototype:** near-identical to
  `stone`, but adds primitives to maintain for no visible gain.
- **A serif for all headings:** looks editorial in a mock dashboard, but hurts
  scanning in issue lists and the board.

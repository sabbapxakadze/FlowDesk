# 0016 — Neutral gray instead of warm stone, and Lucide for icons

Status: Accepted — 2026-09-30. Supersedes the neutral scale in ADR 0013 (`stone`)
and the `stone-450` stop in ADR 0015; both remain correct about everything else.

## Context

ADR 0013 chose Tailwind's warm `stone` scale for neutrals, inspired by the look
of a product the owner liked. In use, the owner found the result brownish
(the stone dark tones, especially the sidebar and dark mode, read as brown-black)
and asked for gray, black or dark gray instead. Separately, icons had been
hand-drawn or typed as glyphs (an emoji bell, `☰`, `✕`, `×`, `←`, a hand-written
SVG grip), which is inconsistent and OS-dependent; the owner asked that all icons
come from Lucide.

## Decision

- **Neutrals:** every semantic token that pointed at `stone` now points at
  Tailwind's `neutral` scale (pure gray, zero chroma). Page `neutral-100`,
  surface white, text `neutral-950`, muted `neutral-600`; dark page
  `neutral-950`, surface `neutral-900`, muted `neutral-400`; sidebar
  `neutral-900` (light) and `neutral-950` (dark). Only the scale name changed;
  no component was touched, which is the point of the two-tier token system.
- **The added control-border stop** is now `--color-neutral-450`
  (`oklch(0.64 0 0)`), same lightness as before, so the numbers hold:
  3.36:1 against white and 3.08:1 against the page in light mode (dark uses
  `neutral-500`: 3.78:1 and 4.18:1).
- **The accent stays the desaturated slate-teal** from ADR 0013; only the
  neutrals changed.
- **Icons:** `lucide-react`. Used for the bell, the drag grip
  (`GripVertical`), the mobile menu and close buttons (`Menu`, `X`), the label
  remove button (`X`) and the page back link (`ArrowLeft`). Icons are decorative
  (`aria-hidden`); their buttons keep their `aria-label`s. Text arrows inside
  sentences and links (for example "Search →") are prose, not icons, and stay.

## Consequences

- Re-measured on the real tokens, 22 pairs in both modes (text, muted, link,
  danger, warning, chart marks, focus ring, input border, status dots, sidebar
  text and active state, palette highlight): all met their threshold.
- Changing the neutral again is the same one-line-per-token edit. The comment at
  the top of `semantic.css` says how.
- `docs/design/direction-prototype.html` still shows the old warm palette; it is
  a throwaway prototype and was not updated.
- Lucide is a new dependency (`lucide-react`); it is tree-shaken, so only the
  six icons above ship.

## Alternatives rejected

- **`zinc` or `slate`** (slightly cool grays): would also remove the brown, but
  the owner asked for gray and black, and `neutral` is the only Tailwind scale
  with no hue at all.
- **Keeping the hand-drawn SVGs:** consistent enough today, but every new icon
  would be another hand-drawn one.

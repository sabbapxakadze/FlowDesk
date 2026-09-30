# 0015 — Control borders at 3:1, and a layout route for the auth pages

Status: Accepted — 2026-09-30

## Context

ADR 0013 recorded one known, unfixed accessibility gap: the border of text
inputs, textareas and selects (`--color-border-input`) was about 1.5:1 in light
mode and 1.7:1 in dark mode, against WCAG 1.4.11's 3:1 for the boundary of a
control. The public screens (login, register, reset) are the first place a
visitor meets form controls, so the fix ships with their redesign. Those five
pages were also bare left-aligned forms, and `/` was still the Phase 0
health-check page.

## Decision

- **Control borders:** only `--color-border-input` changes; decorative borders
  (cards, dividers) stay light on purpose. Light mode uses a new primitive,
  `--color-stone-450` (`oklch(0.64 0.012 58)`), because Tailwind's stone scale
  jumps from `stone-400` (2.6:1 on white, 2.4:1 on the page) to `stone-500`
  (4.8:1, visibly heavy). Measured on the real tokens in the browser: 3.36:1
  against a white card and 3.08:1 against the page. Dark mode uses `stone-500`
  (3.65:1 on the card, 4.13:1 on the page).
- **Control visuals** in `shared/ui`: inputs, textareas and selects get an
  explicit surface background (they were transparent, so dark mode depended on
  the page behind them), `px-3 py-1.5 text-sm`, and disabled and
  `aria-invalid` states (a red border). The four auth forms also set
  `autoComplete` values and `aria-invalid`.
- **Error text:** light-mode `--color-text-danger` moves from `red-600` to
  `red-700`. Measured, `red-600` was 4.77:1 on a white card but only 4.37:1 on
  the stone-100 page, where many error messages sit.
- **Auth pages use a layout route** (`app/AuthLayout.tsx`), the same pattern as
  the app shell (ADR 0014): a centered card with the brand above; each page
  keeps its own `<main>`. It is separate from the app shell because these pages
  are reachable logged out and must never show the app navigation.
- **`/` becomes a redirect** (logged in to `/projects`, logged out to
  `/login`); the health-check page is deleted. Its job, proving one Zod schema
  validates on both sides of the API, is recorded in the roadmap.

## Consequences

- Every input, textarea and select in the app now has a compliant border, not
  just the auth forms, so all other forms look slightly heavier. Spot-checked on
  Projects and the project issue list.
- The design system now has one more stop (`stone-450`) than Tailwind ships.
- Not verified: real Tab-key traversal (focus rings were checked as before),
  browsers other than Chrome.
- The disabled-control opacity (0.6) was not measured; WCAG exempts inactive
  controls from contrast requirements.

## Alternatives rejected

- **`stone-500` for all control borders:** compliant but visibly heavy on every
  form.
- **Leave the borders and rely on the surface color difference:** inputs sit on
  white cards, so the fill does not separate them; that would not meet 1.4.11.
- **Keep the health-check page at `/`:** a public page that only proves a Phase
  0 milestone, and it was where logged-out visitors landed.

# 0043 - A public landing page at `/`

Status: Accepted - 2026-10-07.

## Context

A logged-out visit to `/` went straight to `/login`. The owner wanted a page that says what FlowDesk is, shows the real app, and gives their contact details, before Log in / Create account. Decisions made with the owner from rendered mockups (scratchpad, not in the repo): the centered hero with the product screenshot rising from the bottom edge and fading out, content "B" (hero, switchable preview, feature tiles, "Built by"), at `/` for visitors. After seeing the first build the owner asked for a richer, bigger page and a different background than the dot grid; the page was expanded (about, how it works, use cases, more tiles, a closing call to action) and the background became soft diagonal ribbons.

## Decision

- **Where it shows.** `RequireAuth` takes a `publicHome` prop (`App.tsx` passes `<LandingPage />`). When nobody is signed in, the session did not just end, and the path is exactly `/`, it renders the landing page instead of redirecting. Every other protected path redirects to `/login` as before. The landing page is not a route of its own, so it cannot be reached at another address, and logged-in people at `/` still get My work.
- **Logging out, expiry and inactivity still go to the login page.** `SessionEndReason` gained `"signed-out"`; `logout()` sets it (no notice text). Only a first visit, or a reload of `/` with no session, shows the landing page. The "login page after logging out fades in" behaviour of ADR 0029 and the notices of ADR 0038 are unchanged.
- **Content** (all of it true to what is built today, nothing promised): the hero ("Plan the work. Follow it through." and "Boards, sprints, issues and analytics, updated live for everyone on your team."; the wording avoids "small" and "engineering" on purpose), a screenshot preview with Board / Issues / Analytics pills (pressed state, the app's cross-fade through `withViewTransition`, the light or dark picture for the theme actually showing, via `useResolvedTheme`), an "about" section with a small picture of how organization, projects and issues nest, "how it works" in three steps, eight feature tiles, four ways of working (use cases), a closing Create account / Log in block, and "Built by Saba Pkhakadze" with the owner's email and phone as `mailto:` and `tel:` links ("a learning project, built end to end by one person"; no claims about availability, pricing or users).
- **Look.** The auth pages' language (ADR 0041): glass surfaces, serif titles, the teal action colour, the theme switch in the corner. The background is a few wide, soft, diagonal ribbons down the whole page (`.landing-ribbon`, colours from the existing `--color-aurora-*` tokens, so dark mode needs nothing extra). The preview frame fades out at its bottom edge (`.landing-fade`). Headings: one `h1`, `h2` per section, `h3` per item.
- **Screenshots** are static files in `apps/web/public/landing/{board,issues,analytics}-{light,dark}.jpg` (1440x900, JPEG quality 85, about 0.7 MB for all six), retaken from the demo organization by `pnpm landing:shots` (`e2e/scripts/capture-landing.mjs`; needs `pnpm dev` and the seeded demo org; it only logs in and looks). The frame shows only the top part of each picture, so the sidebar's bottom user name is not visible. They go out of date when the UI changes: retake them then.
- **No API calls of its own.** Only the app's usual silent session check runs on load (a test asserts it).

## Trade-offs, named

- `RequireAuth` now knows about `/`. The alternative (a separate route for visitors) would have needed the app to decide before knowing whether anyone is signed in, which is the thing `RequireAuth` already waits for.
- A reload of `/` on a device whose session is gone shows the landing page, not the login page. Two existing tests asserted the old redirect and were updated on purpose (`account.spec.ts`, `my-work.spec.ts`).
- The email and phone number are on a public page and can be harvested by bots; the owner chose to show them. A contact form or an obfuscated link is the alternative if spam appears.
- It is a client-rendered app: no search-engine optimisation beyond a `<meta name="description">`, and the first load pulls the whole app bundle (a landing-only chunk could be split off later; not measured).
- The ribbons are opacity 0.42, chosen so text over them keeps its contrast: measured on the rendered page in light and dark, wide and phone width, the worst text was 5.11:1 (a first version at opacity 0.6 had two muted paragraphs at 3.99 and 4.38 in dark mode).

## Not verified

Safari and Firefox rendering of the blur and the fade mask; a real phone; how the page looks in a link preview; a Lighthouse or load-time measurement.

## Alternatives rejected

- A dot grid with one glow (the first build): the owner did not like it.
- Blurred real-app background, the split layout and the top-bar layout (mockups): the owner picked the centered hero.
- A separate `/welcome` address: nobody would land there by default.

## Noted 2026-10-07

A third button, "Try the demo", and a note about the demo's lifetime were added to the hero and the closing block when the server offers the demo (ADR 0044).

# Roadmap

Each phase is a set of **vertical slices**. A slice goes through every layer it
touches and ends in a reviewable, committable state. Work one slice at a time.

Mark slices `[x]` as they land. Update "Current phase" in `CLAUDE.md`.

---

## Phase 0 — Foundations

Goal: the rules, the skeleton, and the design language exist before any feature.

- [x] pnpm workspace, TypeScript project references, shared eslint/prettier
- [x] `apps/api` boots: Express, pino, request IDs, Zod-validated env, `/health`
- [x] `apps/web` boots: Vite, React Router, Tailwind v4
- [x] `packages/contracts` wired into both, proven by one shared schema
- [x] Token scaffold (primitives only): color/spacing/type scale wired into
      Tailwind `@theme`. No semantic layer yet, no component library — this is
      config so raw Tailwind values aren't hardcoded from the first component.
- [x] `eslint-plugin-boundaries` enforcing FSD layers
- [x] Hooks: typecheck + lint run automatically after edits

**Done when** both apps run, share one Zod schema, and a layer-boundary
violation fails the build.

## Phase 1 — Walking skeleton

Goal: prove the architecture end to end before building on it.

- [x] Drizzle connected to local Postgres 16; first migration
- [x] `organizations` + `projects` tables
- [x] `GET /api/v1/organizations/:organizationId/projects` through routes →
      controller → service → repository. Nested under the organization
      rather than flat `/api/v1/projects` — `organizationId` is tenant
      scoping, not a filter; see ADR 0004 and CLAUDE.md's repository rule.
- [x] Contract-typed response consumed by a TanStack Query hook
- [x] Projects list page composed per FSD
- [x] First integration test hitting a real database (tenant-isolation
      shaped: proves org A never sees org B's projects)

**Done when** one trivial feature exists in every layer and is tested.

## Phase 2 — Auth & multi-tenancy ✅ complete

Split into four ordered slices, all shipped.

- [x] `users`, `organizations` (Phase 1), `organization_members`,
      `sessions` schema — all four tables now exist
- [x] Register + Argon2id hashing — registering does **not** log you in;
      that's what Slice 2 added. Register auto-creates a personal
      organization (owner role) in one transaction — verified the
      transaction actually rolls back on a mid-way failure, not just the
      happy path.
- [x] Login → short-lived access JWT (memory only) + opaque refresh cookie
- [x] Refresh rotation with reuse detection (revoke session family) —
      verified on real Postgres and over real HTTP (curl with a cookie
      jar): a reused refresh token fails *and* takes the whole family down
      with it, including tokens that were never themselves reused.
- [x] Logout, single-session and all-sessions — both derived from the
      refresh cookie itself, no access token required
- [x] Roles (Owner/Admin/Member/Viewer) → permission map → `requirePermission`
      — map kept intentionally small (`view_project`, `manage_project`);
      grows with the features that need more, same pattern as the
      `organization_role` enum itself.
- [x] `req.ctx` membership resolution middleware — `requireAuth` →
      `requireOrgMembership` → `requirePermission`, three composable
      pieces. This is what replaced the Phase 1 `TEMPORARY` hardcoded org
      id in `ProjectsPage.tsx` with real auth-derived context.
- [x] **Tenant isolation test suite**: prove Org A cannot read Org B — now
      at the HTTP level (supertest, driving the real middleware chain),
      superseding the Phase 1 repository-level version. Verified live: a
      real, validly-logged-in user from Org A gets a genuine 403 hitting
      Org B's URL, not just a repository-query check.
- [x] Auth UI: login, register, verify-email, forgot/reset-password —
      React Hook Form + Zod throughout.
- [x] Email verification + password reset (single-use hashed tokens) — one
      unified `auth_tokens` table (`purpose` enum) for both, not two
      near-identical tables. Real email via Resend, verified with a real
      inbox: registered with a real address, received the actual email
      (landed in spam — expected for an unverified sandbox sender, not a
      bug), clicked through, confirmed `emailVerifiedAt` set server-side.
      Password reset verified the same way end to end, including
      confirming every prior session was revoked and the new password
      actually works.
- [x] Rate limiting on auth routes — `express-rate-limit`, strict on
      login, moderate on register/password-reset-request. Skipped under
      `NODE_ENV=test` (a shared in-process app would otherwise trip on
      legitimate test traffic) — the mechanism itself is proven by an
      isolated test app, and the real config was independently confirmed
      live: 11 rapid login attempts in dev mode, first 10 return 401, the
      11th returns a genuine 429.

## Phase 3 — Issues core + event system ✅ complete

Slice 1 (create + read) shipped:

- [x] `issues`, `issue_events` schema — `labels`/`issue_labels`/`comments`
      land in later slices
- [x] Human-readable keys (`AUTH-23`) via a per-project atomic counter
      (`projects.nextIssueNumber`, incremented with `UPDATE ... RETURNING`
      inside the create transaction) — verified safe under concurrent
      creates with a real `Promise.all` test, and confirmed the test
      actually catches the race by swapping in a naive `SELECT MAX+1`
      and watching it fail before reverting
- [x] Create / read issue, nested under a project via a new
      `requireProject` middleware (org membership + project-in-org check,
      same defense-in-depth shape as `requireOrgMembership`)
- [x] Domain events written in the mutation's transaction — `issue.created`
      proven with a real Postgres test (one event row per created issue)

Slice 2 (update + optimistic concurrency) shipped:

- [x] Update issue (title/description/status) + `version` column + 409 on
      conflict — conditional `UPDATE ... WHERE version = $expected`, same
      atomic-write pattern as slice 1's counter, verified with a real
      concurrent-update test (two `Promise.all` updates from the same
      version, exactly one succeeds) and the same "break it, watch the
      test fail, revert" rigor as slice 1's counter check. 409 responses
      carry the current server state (`AppError`/`ApiError` gained a
      reusable `data` field for this). New `requireIssue` middleware,
      same shape as `requireProject`.
- [x] `issue.updated` events — payload is the changed fields' new values,
      same minimal-payload precedent as `issue.created`
- [x] Edit UI: inline edit form on the project detail page; a stale save
      is rejected, the list refetches, and a conflict notice shows —
      verified live (edited an issue in the UI, updated it via `curl`
      behind the scenes to bump its version, then saved the stale UI edit
      and confirmed the 409 path end to end)

Slice 3 (labels) shipped:

- [x] `labels` (org-scoped, not project-scoped) + `issue_labels` schema —
      attach/detach live in the `issues` module (they're issue mutations,
      each writes an `issue_events` row) rather than a separate module.
      `labels` itself gets a minimal org-level create+list surface only.
- [x] `issue.label_added` / `issue.label_removed` events, same
      minimal-payload precedent as `issue.created`/`issue.updated`
- [x] Inline label picker in the issue edit form: attach, detach, and
      create-a-new-label-on-the-fly — verified live end to end (created a
      label, attached it, confirmed the duplicate-attach 409 and the
      cross-org-label 404, detached it, confirmed both `issue_events`
      rows via `psql`)
- [x] **Found and fixed a real pre-existing bug** while testing this:
      `isUniqueViolation()` (used for the 409-on-duplicate-key path in
      `projects.service.ts`, and copied into `labels.service.ts` /
      `issues.service.ts` for this slice) checked `err.code`/`err.constraint`
      at the top level, but this drizzle-orm version wraps the real pg
      error under `err.cause` — the check never matched, so a duplicate
      project key silently fell through to a raw 500 instead of the
      intended 409. Fixed in all three places; added the test that would
      have caught it (`projects.repository.test.ts`).
Slice 4 (comments + activity timeline + issue detail page) shipped:

- [x] `comments` schema — source of truth for a comment's body (future
      edit/delete would touch this table), but the *read* surface for
      this slice is entirely the activity timeline: no separate
      `GET .../comments` endpoint. Comment creation lives in the `issues`
      module, same call as labels' attach/detach.
- [x] `issue.commented` events, with the comment body in the payload so
      the timeline never has to join back to `comments` to render it —
      fourth and last use of the transactional event pattern this phase.
- [x] Real activity timeline (`GET .../issues/:issueId/events`, joined to
      `users` for the actor's name) — the ADR 0005 payoff: one feed for
      created/updated/label-added/label-removed/commented. Existing
      mutations (`EditIssueForm`, `LabelPicker`) now also invalidate the
      events query so the timeline updates live without a refresh —
      verified in the browser (edited the issue, attached a label,
      posted a comment; all three appeared in the timeline immediately).
- [x] Real issue detail page (`/projects/:projectId/issues/:issueId`),
      reusing `EditIssueForm` (with its label picker) exactly as
      `ProjectDetailPage` already does, plus the timeline and a comment
      box. `IssueCard`'s title now links to it.
- [x] A real "one issue's whole life" test: create → update → attach
      label → comment, asserting the four resulting events come back in
      chronological order with the correct actor name on each.

## Phase 3.5 — Design system extraction ✅ complete

Goal: by now there are real screens (auth forms, project list, issue detail,
activity timeline) to draw a design system *from*, instead of guessing one
upfront. This is a deliberate pause to consolidate, not new product features.

Slice 1 (semantic tokens + dark mode infrastructure) shipped:

- [x] Audit components built so far; extract repeated patterns into semantic
      tokens (`--color-bg-surface`, `--color-text-muted`, `--radius-card`, ...)
      — derived from a real audit of all 21 `className=`-using files, not
      guessed. Values reference Tailwind v4's own generated primitive
      variables (`var(--color-gray-500)`, etc.), not hardcoded hex.
- [x] Dark mode via `@media (prefers-color-scheme: dark)` redefining the
      same semantic tier, plus a `[data-theme="dark"]` override ready for
      a future manual toggle (none built yet — no toggle UI in this slice).
      Verified live: this machine's real OS dark-mode preference made the
      app render dark automatically, no code path beyond the media query.
- [x] Inter actually loads now (`@fontsource-variable/inter`, self-hosted)
      — `--font-sans` already named it since Phase 0, but nothing loaded
      the font file, so every screen had silently been falling back to a
      system font. Found and fixed as part of finishing this layer.
- [x] **Found and fixed a real Tailwind v4 behavior** while verifying this:
      `@theme` silently tree-shakes declared variables it can't detect a
      utility-class consumer for via static source scanning — most of the
      new semantic tokens were silently missing from the compiled CSS
      output until switched to `@theme static` (confirmed by reading the
      actual generated stylesheet, not by trusting the source file).
      Component migration (slice 2) will give these tokens real utility
      consumers, but `static` is still correct going forward since new
      tokens will keep getting added before their first consumer exists.
Slice 2 (component migration) shipped:

- [x] Rewrite existing components to consume semantic tokens only, remove any
      raw Tailwind values that snuck in — 17 of 21 `className=`-using files
      needed the swap (the other 4 — `ForgotPasswordPage`, `LoginPage`,
      `RegisterPage`, `LabelBadge`'s one intentional exception — already had
      no raw semantic-category class to migrate). First use of Tailwind's
      arbitrary-value bracket syntax (`text-[var(--color-text-muted)]`)
      anywhere in the codebase. Automated proof, not just a visual check: a
      grep for every raw class in the mapping table returns zero matches
      outside the two named exceptions (`LabelBadge`'s `text-white`/
      `rounded-full`, both data-driven, not themed).
- [x] Dark mode: redefine the semantic tier, verify nothing else needed to
      change — now actually true, since slice 1 only `body` consumed the
      tier. Verified live: real card/button computed styles (border color,
      background, radius) match the original raw Tailwind values exactly in
      light mode (zero regression) and correctly flip in dark mode, checked
      via `getComputedStyle` on real rendered elements, not just the token
      file's own custom properties.
Slice 3 (shadcn-derived base components) shipped:

- [x] Pull in shadcn-derived components into `shared/ui` as actually needed,
      rewritten onto our semantic tokens — `Button` (`class-variance-authority`
      variants, the real shadcn authoring pattern), `Input`, `Textarea`,
      `Select`, `Field` (lifted from `RegisterForm`'s own local copy of the
      same pattern), `Card`, `ErrorText`, plus `lib/cn.ts` (`clsx` +
      `tailwind-merge`, shadcn's standard class-merging helper). No Radix —
      nothing built yet needs a dialog/portal/combobox.
      14 forms/cards refactored to use them instead of hand-rolled markup.
      Two small, named normalizations along the way (not silent): the 4 auth
      forms' submit buttons now consistently get `text-sm` (they never had
      it before, an inconsistency, not a choice), and `LabelPicker`'s
      "Create" button padding now matches every other small button
      (`px-2`→`px-3`). Verified live: registered/logged in, created a
      project and an issue, edited it with the label picker, posted a
      comment — full real behavior through the new components, not just a
      visual look — then confirmed via `getComputedStyle` that a migrated
      card/button's border, radius, and background match the pre-slice
      values exactly in light mode and still correctly flip in dark mode.

Slice 4 (`/design-system` route) shipped:

- [x] `/design-system` route documenting every token and base component —
      public, not behind `RequireAuth` (it documents the UI system, not
      app data — "portfolio material" per ADR 0006 means anyone can see
      it). All 11 color tokens + 2 radius tokens as live swatches (a
      hardcoded, typed list, not parsed from `semantic.css` — small and
      stable enough that drift would be a visible diff), plus every
      `shared/ui` component rendered as a real working instance.
      Found and fixed a real bug before it ever reached the browser:
      building an arbitrary-value class via a template literal
      (`` `bg-[var(${token.cssVar})]` ``) doesn't work — Tailwind's JIT
      scanner reads literal source text, not runtime-evaluated strings,
      so it can never see the resolved class name. Fixed with a lookup
      table of complete literal strings per token. Verified live:
      confirmed the route loads without logging in, and toggled dark mode
      on the page itself — every swatch and every live component
      responded, checked via `getComputedStyle`, not just eyeballed.

**Done when** dark mode is a ~20-variable change and every component so far
uses only semantic tokens. *(True as of slice 2 — confirmed by the grep in
slice 2's verification, not just assumed from the diff.)*

## Phase 3.6 — Visual identity (paused after slice 1, minimal)

Goal: Phase 3.5 built the *infrastructure* for consistent design (tokens,
dark mode, a shared component library) — it deliberately didn't touch the
actual aesthetic. This phase started spending that infrastructure on a
real visual identity, but slice 1 went through two direction changes
(Linear-style → Notion-inspired warm coral/stone → simplified) before the
owner made an explicit call: finish the product's functionality first
(Phases 4-8) and do one real, considered design pass later, once there's
more surface to design for, rather than iterating on color in the abstract
now. Slice 1 landed in a **deliberately minimal** form as a result — real
structural improvements (hover/focus states, shadow-based card elevation,
softer radii, a status-color system) kept, but the color story simplified
to a plain deep-blue accent on the stock cool `gray` neutral scale instead
of a hand-tuned warm palette. Slice 2 (rolling polish out to every
remaining screen) and any further aesthetic work are **explicitly
deferred** — see the flagged revisit point below.

Slice 1 (visual foundations, kept minimal) shipped:

- [x] A real accent color — FlowDesk's own deep blue (`--color-accent-*`,
      an 11-shade hand-crafted primitive scale, hue ~250 in OKLCH,
      replacing the placeholder `--color-brand-500`), used for links,
      focus rings, and the in-progress status. Originally warm coral on
      warm `stone` neutrals (a fuller Notion-inspired take); simplified to
      deep-blue-on-`gray` per the owner's explicit call to keep this slice
      minimal rather than keep tuning color — the `stone` experiment is
      gone, semantic tokens reference the stock `gray` scale again.
- [x] A fixed 3-color status system (`--color-status-todo/in-progress/done`)
      as new semantic tokens, applied via a new `StatusBadge` (a colored
      dot + label) — replacing plain status text on issue cards and the
      issue detail page.
- [x] Cards drop the hard border for a soft shadow + background contrast
      (`bg-page` = `gray-100`, `bg-surface` = white) — reads as elevated
      without an outline. Softer, larger corners (`radius-card` → 12px,
      `radius-control` → 6px).
- [x] Every `shared/ui` component gets real hover/focus states — there
      were none anywhere before this (confirmed via the Phase 3.5 audit).
      `Button` hover (opacity shift) and `Card` hover (shadow increase)
      verified via `getComputedStyle` during a real simulated hover, not
      just eyeballed. A real accent-colored focus-visible ring on every
      form control — a genuine accessibility gap closed, not just a style
      change.
      Found and fixed a real layout bug while verifying live:
      `StatusBadge` (an inline element) replacing a block-level status
      `<p>` on the issue detail page let the adjacent "Edit" button flow
      onto the same line with no gap — caught by screenshot, not by
      reading the diff, fixed with an explicit flex row.
      Proven on `ProjectsPage` and `IssueDetailPage` (its richest screen)
      in both light and dark mode.
- [x] Slice 2a — **Design foundation (2026-09-30).** The revisit point was
      reached (Phase 8 done). Owner chose palette A from
      `docs/design/direction-prototype.html`: warm `stone` neutrals,
      slate-teal accent ramp, Inter for text, Newsreader (serif) for page
      titles and big numbers only. Only tokens and type changed: see
      ADR 0013. Contrast measured in the browser on the real token pairs
      (both modes); `text-warning` and the to-do status dot were below
      threshold (also before this slice) and were fixed; `border-input`
      (about 1.5:1 vs 3:1) is known and left. Found that the old font
      stack named `"Inter"` while fontsource registers `"Inter Variable"`,
      so Inter was probably never applied; fixed. Checked live on
      Projects, Board, Analytics and `/design-system`; Analytics in
      both modes. Not checked: issue detail, login and the other pages.
- [x] Slice 2b — **Persistent navigation shell (2026-09-30).** React Router
      layout route (`app/AppShell.tsx`) + `widgets/sidebar`: Projects,
      Search, the org's projects (the current one expands to Issues, Board,
      Sprints, Analytics), Design system, user and Log out. The bell moved
      into it (no longer fixed top-right, so it no longer overlaps links).
      Mobile: top bar + drawer. Five new sidebar tokens; see ADR 0014.
      Checked live: all seven protected routes have the sidebar with the
      right current item (`aria-current`), public pages have none, logout and
      the logged-out redirect work, a real teammate comment updated the
      bell badge live from inside the sidebar, the drawer opens/closes by
      button, Escape and link at 420px, contrast of the sidebar token pairs
      measured in both modes. Not verified: Tab-key order (focus rings were
      checked by focusing programmatically), browsers other than Chrome.
      Not done, on purpose: the per-page links remain; no Ctrl+K button, no
      theme toggle.
- [x] Slice 2c — **Public screens and form controls (2026-09-30).** Auth
      layout route (`app/AuthLayout.tsx`): login, register, verify, forgot and
      reset are a centered card with the brand, plus cross-links (Create an
      account / Log in / Back to log in). `/` is now a redirect and the Phase 0
      health page is deleted (its job, proving one Zod schema on both sides,
      is done). Control borders fixed to 3:1 with one new primitive
      (`stone-450`) in light mode and `stone-500` in dark; error text
      `red-600` to `red-700` (4.37:1 on the page before). Inputs/selects/
      textareas got a surface background, padding and invalid state; auth forms
      got `autoComplete`. See ADR 0015. Checked live: contrast measured in
      both modes, wrong password keeps the fields and shows the error, valid
      login lands on `/projects`, `/` redirects both ways, register validation
      shows red borders and messages, Projects and the issue list still fine
      with the new controls. Screenshots seen: login (light, 1440px), register
      (dark, 1440px, and dark with validation errors at 420px). Forgot, reset
      and verify were only checked by DOM (one main, no sidebar, no sideways
      scroll, right text), not by eye. Not verified: Tab-key order, verify-email with a
      real token, reset with a real emailed token, browsers other than Chrome.
- [x] Slice 2d — **Page structure for logged-in pages (2026-09-30).** New
      `Page` (the one `<main>`, responsive padding, reading width `max-w-5xl`
      centered or wide `max-w-7xl`) and `PageHeader` (eyebrow, serif title,
      optional back link, meta row) in `shared/ui`; all seven logged-in pages
      use them, and so do their loading and not-found states, which had no
      `<main>` before (ten places). Project pages are now titled Issues /
      Board / Sprints / Analytics with the project name as the eyebrow, matching
      the sidebar. Removed the duplicated links ("Board →", "Sprints →",
      "Analytics →", "Search →", "← All projects" and the project back links);
      the issue page keeps "← project", and its edit mode now shows an "Edit
      issue" header. Checked live: one main and one h1 on each page, no leftover
      links, bogus project/issue URLs render their message inside a main with
      the sidebar, status filter still writes `?status=`, a real pointer drag
      on the board still moves a card (ANL-2 Todo to In progress), mobile
      layout has 16px padding and no sideways scroll. Note: the automated
      browser would not go below 467px wide, so the narrow check was at 467px,
      not 420px. Not checked: saving or cancelling an issue edit, analytics
      range selects and the sprints drag surface after the change, light-mode
      screenshots of every page (light: issue detail only), dark 1440px.
      Seen, not fixed: a bogus issue URL shows the skeleton for about 7 seconds
      before "Issue not found." because the 404 is retried.
- [x] Slice 2e — **Data screens (2026-09-30).** One `IssueSummary` face shared
      by the issue list card, board card, sprint card and the drag overlay
      (it was hand-written four times); a `DragHandle` SVG grip instead of a
      text glyph (same button, aria-label and dnd-kit props; adds `touch-none`);
      `ColumnHeader` (status dot, name, count) for board columns and sprint
      zones; `EmptyState block` (dashed box, also a clearer drop target) on
      data screens; `SprintStatusBadge` (dot + label, reuses the three status
      colours, no new tokens); the project, issue and sprint create forms sit
      on a card surface; project keys are pills; the timeline has a left rail
      with dots (rail uses `border-input` so it is actually visible, the first
      attempt with `border-default` was ~1.1:1 and invisible); the attachment
      file picker is styled with `file:` utilities. `STATUS_DOT_CLASSES`
      moved into `statusLabels.ts` so StatusBadge, ColumnHeader and
      SprintStatusBadge share one colour table. Checked live: a real pointer
      drag on the board and one on the sprint page (after creating and
      starting a sprint), a keyboard drag on the board (one move request, no
      strays), creating an issue, opening edit-in-place; screenshots seen:
      board, sprints, issue detail (light and dark), issue list (dark).
      Not verified: saving an edit-in-place, creating a project or sprint
      beyond the one I made, uploading a file, narrow-width screenshots,
      Search results, light-mode Issues list, and contrast numbers for the new
      pieces (the dashed border and timeline dots use `border-input`, already
      measured at 3:1 in slice 2c; nothing else new carries text). Note: while
      testing, the API log showed several board moves I did not make, most
      likely someone else using the QA account at the same time; a single
      keyboard drag on its own produced exactly one move.
- [ ] Slice 2f — Overlays (command palette, notification panel) and the
      `/design-system` page documenting shell, tokens, display font,
      components.

**Revisit point (flagged, not scheduled)**: once Phases 4-8 have built out
the full feature surface — real screens for filtering/pagination, the
Kanban board, real-time presence, search/notifications, and analytics —
there's enough actual product to design for instead of guessing ahead of
it. That's the natural point for one real, considered design pass (finish
slice 2, revisit the warm-vs-cool neutral and accent-color decision with
real screens in hand, add a persistent nav shell). Raise this explicitly
with the owner when the roadmap reaches that point, rather than waiting to
be asked.

**Done when** (deferred) every existing screen reflects a deliberate visual
direction, not just the ones touched directly in this minimal slice 1.

## Phase 4 — React depth ✅ complete

Slice 1 (cursor pagination on the issues list) shipped:

- [x] Server-side cursor pagination on `GET .../projects/:projectId/issues`
      — keyset (`WHERE (created_at, id) < (cursor)`, not `OFFSET`), ordered
      `created_at DESC, id DESC` with `id` as the tie-breaker. `limit`
      defaults to 25, capped at 100 (`listIssuesQuerySchema`). Response
      gained `nextCursor: string | null`; `null` means no further pages —
      no separate `hasMore` field.
- [x] TanStack Query conventions: `useIssues` rewritten on
      `useInfiniteQuery` (`getNextPageParam` reading `nextCursor`), same
      `issueKeys` factory the old `useQuery` version used — no key-shape
      change needed. `ProjectDetailPage` flattens `data.pages` and renders
      a plain "Load more" button (`hasNextPage`/`fetchNextPage`); no
      skeletons/infinite-scroll treatment yet — that's slice 2's "reusable
      list, empty states, skeletons" item, not this slice's.
- [x] **Documented index + `EXPLAIN ANALYZE` before/after**, proven against
      5,000 seeded rows in a throwaway project (not assumed): before
      (single-column `issues_project_id_idx`, a keyset query 2,500 rows
      deep) — `Seq Scan` + top-N sort, "Rows Removed by Filter: 2505",
      1.111ms. After swapping to the composite
      `issues_project_id_created_at_id_idx` on
      `(project_id, created_at, id)` — first attempt (the `OR`-expanded
      cursor condition, `created_at < x OR (created_at = x AND id < y)`)
      still fell back to filtering every row past the cursor by hand
      instead of a real index condition, only ~2x faster (0.490ms).
      Switching the query to Postgres's row-constructor comparison
      (`(created_at, id) < (cursor_created_at, cursor_id)`) produced a
      genuine composite `Index Cond` with zero cursor-related row
      filtering, 0.077ms — ~14x faster than the pre-index baseline, and
      critically, cost now scales with `limit`, not with page depth. The
      repository's cursor condition uses this row-constructor form, not
      the `OR` form, specifically because of this measurement — see the
      comment on `listByProject` in `issues.repository.ts`.
- [x] **Found and fixed a real regression this slice's own change would
      have caused**: `IssueDetailPage` had no dedicated "get one issue"
      endpoint — it found the issue by scanning the (previously complete)
      issues list. Once that list only returns its first page, an issue
      past page 1 would silently fail to load on direct navigation. Fixed
      with a new `GET .../issues/:issueId` endpoint (reusing `requireIssue`,
      which already fetches and 404s the row) and a new `useIssue` hook;
      `EditIssueForm` now also invalidates `issueKeys.detail(issue.id)`
      alongside the list, since the detail view no longer shares the
      list's cache entry. Verified live: navigated directly to an issue
      created well past page 1 (27 seeded issues, 25-item pages) and
      confirmed it now loads correctly.
Slice 2 (status filter + sort, URL-driven) shipped:

- [x] Server-side status filter (`?status=todo|in_progress|done`, plain
      `eq()` — no new index; status is a 3-value filter applied on top of
      an already-selective `project_id` equality, not worth a dedicated
      or wider index at this scale) and sort direction (`?order=asc|desc`
      on `created_at`, the only sortable column today — not a general
      multi-column sort system). Both added to `listIssuesQuerySchema`;
      `listByProject`'s `order` flips the `ORDER BY` direction and the
      cursor's comparison operator (`<`/DESC vs `>`/ASC) together, in one
      place, so they can't drift apart into an inconsistent combination.
- [x] **EXPLAIN ANALYZE sanity check** (5,000 seeded rows, reusing slice
      1's approach): both `status` filtering and `order: asc` confirmed
      to still hit `issues_project_id_created_at_id_idx` as an `Index
      Scan`/`Index Scan Backward` — status as a post-index `Filter`
      (expected, not a regression), `asc` as a genuine forward scan on
      the same composite index (Postgres btrees are bidirectionally
      scannable — no second index needed). Re-verified with a cursor
      present too (the actual paginated-request shape), confirming the
      row-constructor `Index Cond` from slice 1 still applies with both
      `<` and `>` comparators.
- [x] URL as the source of truth: `status`/`order` live in
      `ProjectDetailPage`'s `useSearchParams()`, not component state —
      landing directly on a `?status=...&order=...` URL renders already
      filtered/sorted, verified live (not just wired). Filter/order
      changes are a different `issueKeys.list(projectId, filters)` cache
      key entirely, so `useInfiniteQuery` resets to a fresh first page
      automatically — no manual pagination-reset code needed.
      `CreateIssueForm`/`EditIssueForm`'s existing unfiltered
      `invalidateQueries({ queryKey: issueKeys.list(projectId) })` calls
      needed no changes: TanStack's partial key matching means that
      shorter, filter-less key still invalidates every filtered variant.
- [x] Filtered empty state gets its own message ("No done issues.") 
      distinct from the unconditional "No issues yet." — verified live
      against a project with issues in other statuses but none matching
      the active filter.
Slice 3 (reusable list states + error boundary) shipped:

- [x] `Skeleton` and `EmptyState`, new `shared/ui` primitives — `Skeleton`
      a plain pulsing block sized via `className`, same shape as
      shadcn's own; `EmptyState` a consistent wrapper for the
      muted-text "nothing here" message. Deliberately not one generic
      `<List>` component: `ProjectsPage`, `ProjectDetailPage`, and the
      issue-detail timeline differ enough in surrounding chrome (create
      form, filter controls, nested-timeline shape) that one component
      covering all three would need enough props to become the
      premature abstraction CLAUDE.md warns against. Also deliberately
      no `<table>` primitive — nothing in the app renders tabular data
      today, the roadmap's "table/list" wording predates knowing that.
- [x] Reused the *already-existing* `ErrorText` (built for form errors,
      Phase 3.5) for list-level query errors on `ProjectsPage` and
      `ProjectDetailPage` — no new component needed, just applying one
      that was already there.
- [x] Skeletons replace "Loading…" text on `ProjectsPage`,
      `ProjectDetailPage`'s issue list, `IssueDetailPage`'s project/issue
      load, and its activity timeline. Verified live (not just read from
      the diff): an artificial `fetch` delay confirmed the skeleton
      actually renders — surrounding page chrome (header, create form,
      filter controls) stays mounted and stable while only the list
      region shows placeholders, then swaps cleanly to real content with
      zero leftover skeleton nodes.
- [x] **A real `ErrorBoundary`** (`shared/error-boundary/ErrorBoundary.tsx`)
      — a class component (the one place in React's API a function
      component can't do the job; no hook equivalent for
      `componentDidCatch`/`getDerivedStateFromError`), wrapped once
      around the routed content in `App.tsx`. Before this slice the app
      had zero error boundaries anywhere — an unexpected render
      exception white-screened the whole app. Verified live by actually
      throwing (temporarily, in `EmptyState`, reverted immediately after
      confirming): the boundary caught it and rendered the fallback
      ("Something went wrong." + a reload button) instead of a blank
      page — this is the one part of this slice that isn't provable by
      reading the code.
- [x] Filtered empty state (from slice 2) verified live to still render
      correctly through the new `EmptyState` component.
- [~] The `isError`→`ErrorText` query-error path itself (list-level fetch
      failures) was **not independently re-verified live** — attempts to
      simulate a failed fetch in this browser session hit TanStack
      Query's `networkMode` treating the query as "paused" rather than
      erroring, an environment-specific quirk unrelated to this slice's
      code (the `isError`/`error` values themselves are unchanged from
      the already-working logic this slice only swapped the rendered
      element for). Flagged honestly rather than claimed as checked —
      revisit if this ever needs a real confirmation.

## Phase 5 — Kanban board

Slice 1 (board data model + read-only board view) shipped:

- [x] **`board_rank` ordering scheme designed and documented** — new
      ADR 0007: a Postgres `numeric` column (exact arbitrary-precision
      decimal, never `double precision` — no float rounding after
      repeated bisection), all rank arithmetic done in SQL and never
      parsed into a JS number, gap-of-1000 initial spacing, and a
      `scale()`-based rebalance trigger designed now for slice 2 to
      implement. Rank is never sent to the client — not part of the
      public `Issue` contract type — the client only ever expresses
      "put this issue relative to that one."
  - This slice only needed the simple append case (`COALESCE(MAX(board_rank),
    0) + 1000`, in `nextRankSql`) — `create()` assigns it on insert,
    and `update()` now also recomputes it whenever `changes.status`
    genuinely differs from the row's current status (not just present in
    the payload — `EditIssueForm` always resends the current status
    alongside any edit; confirmed the fix doesn't fire on a same-status
    resend). Slice 2 adds the harder bisection-between-neighbors case.
  - Two-step migration (`0008`: nullable column + composite index;
    `0009`, hand-written via `drizzle-kit generate --custom`: a
    `ROW_NUMBER()`-based backfill spacing existing issues by 1000 within
    each `(project, status)` group, oldest-first, then `SET NOT NULL`)
    — confirmed directly in `psql` against real pre-existing dev-DB data,
    not just fresh test rows.
- [x] New `GET .../projects/:projectId/board` endpoint — unpaginated
      (a board's whole point is seeing everything at a glance), ordered
      by `(status, board_rank, id)` matching the new composite index
      exactly. Verified over real HTTP that `board_rank` never appears
      in the response (Zod's default key-stripping on `.parse()` against
      a schema that doesn't declare the field).
- [x] New read-only `ProjectBoardPage` (`/projects/:projectId/board`) —
      three columns, a new `BoardCard` (deliberately not reusing
      `IssueCard`: the action sets are going to diverge once slice 2
      adds move controls). Linked from/to the existing list page. No
      move affordances yet.
  - Verified live: the manual edit form's status change (pre-existing,
    Phase 3 functionality) now correctly repositions an issue to the end
    of its new column on the board — this slice's own regression fix,
    confirmed by actually editing an issue's status in the browser and
    watching it move columns on the board, not just by reading the code.
Slice 2 (move endpoint — bisection + rebalancing) shipped:

- [x] New `PATCH .../issues/:issueId/move` — `{ version, status,
      prevIssueId?, nextIssueId? }`. Neither neighbor appends to the end
      (reuses slice 1's `nextRankSql`); `nextIssueId` present inserts
      before that card, bisecting against `prevIssueId` if given or
      halving `nextIssueId`'s rank if it's the column's first card.
      `prevIssueId` alone is treated as append — always recomputing
      `MAX + gap` fresh is robust against a stale "last card" claim
      rather than trusting it. Neighbors are re-fetched inside the
      transaction, scoped to the *target* column (tenant + column
      validation in one query); a foreign/missing neighbor is a new
      `invalid_neighbor` → `400`.
- [x] **A real bug found via testing, not assumed away**: the first
      implementation checked `scale()` against a threshold of 20,
      matching what ADR 0007 originally specified. Live verification
      against this project's actual Postgres 16 instance showed
      `numeric`'s `/` operator — unlike `+`/`-`/`*` — is *not*
      unlimited-precision: it computes a heuristic result scale around
      16 significant digits total, shrinking further (down to ~12) as
      the integer part grows. A threshold of 20 was unreachable —
      `/` would have silently rounded two distinct deep bisections into
      the *same* stored value long before the "safety net" ever fired.
      Fixed by lowering `MAX_RANK_SCALE` to 10 (real margin below the
      observed ~12-digit floor) and `trim_scale()`-wrapping every
      midpoint (plain division pads its result — `3000::numeric/2` is
      `1500.0000000000000000`, not `1500` — which would otherwise measure
      division's own padding instead of the rank's real precision). ADR
      0007 updated with the full finding. Verified two ways: an automated
      test forcing ~18 iterations of genuinely deepening bisection between
      the same two neighbors and asserting the observed scale never
      exceeds 10; and the same sequence run live against real seeded data
      via the actual HTTP API, watching `psql` directly — scale climbing
      3→10 across 8 real requests, then visibly resetting to a clean
      integer (a real rebalance) before climbing again.
- [x] Always writes an `issue.moved` event (`{ fromStatus, toStatus }`),
      even for a same-column reorder — no carve-out from CLAUDE.md's
      audit convention for a "boring" state change. `IssueDetailPage`'s
      timeline phrases the two cases differently ("reordered this issue"
      vs. "moved this issue to In progress") — verified live for both.
- [x] `BoardCard` gains up/down arrows (disabled at column boundaries)
      and a "Move to…" select, wired through a new `useMoveIssue` hook
      (`features/move-issue` — a real hook rather than a form-inlined
      mutation like `edit-issue`/`create-issue`, since multiple buttons
      across the whole board share it). Verified live: reordering within
      a column and moving across columns both persist and both endpoints'
      cache invalidation (list, board, detail, events) keeps every view
      in sync.
Slice 3 (real drag & drop with optimistic updates) shipped:

- [x] `@dnd-kit/core` + `@dnd-kit/sortable` (+ `@dnd-kit/utilities`) —
      not core alone: sortable's keyboard coordinate getter is what
      makes drag genuinely keyboard-operable (Tab to the handle, Space
      to pick up, arrow keys to move — including across columns, Space
      to drop), not just pointer-draggable. Each column is droppable
      (append) and a `SortableContext`; each card is a sortable drop
      target (insert-before). Replaces slice 2's up/down/move-to-column
      buttons entirely — `BoardCard` calls the same `useMoveIssue`
      mutation slice 2 already built, just triggered by `onDragEnd`
      instead of a click handler.
- [x] **A real bug found via live testing, not assumed away**: the
      first version put the drag `listeners`/`attributes` on the whole
      card, including its title `<Link>`, on the theory that
      `PointerSensor`'s activation distance would disambiguate a click
      from a drag. It didn't — verified live: completing a drag
      actually navigated to the issue detail page mid-drop (dnd-kit's
      synthetic click after a finished drag still fires on the
      original pointerdown target; checking `isDragging` in the Link's
      own `onClick` doesn't help, since that flag has already reset to
      `false` by the time the click event fires). Fixed with a
      dedicated drag-handle button, separate from the `Link` — the
      standard fix, not a click/drag disambiguation hack. `Card`
      (`shared/ui`) needed converting to `forwardRef` for `useSortable`'s
      `setNodeRef` to attach to, same reason `Input`/`Textarea`/`Select`
      already are, for React Hook Form.
- [x] Optimistic update lives in `useMoveIssue`'s `onMutate`/`onError`
      (TanStack Query's own mechanism — snapshot the board cache, splice
      the moved issue into its new position immediately, restore the
      snapshot on failure), not a separate local-state layer — reuses
      the data layer the project already has instead of adding a second
      one. Scoped to the board query only; the list view still just
      refetches on settle.
- [x] Verified live, end to end, including the two things easiest to
      silently ship broken: a real HTTP 409 injected via a mocked route
      confirmed the optimistic move rolls back to the exact pre-drag
      state (a real request fired and was rejected, not just "nothing
      happened"); and an actual keyboard-only pass (focus the handle,
      Space, arrow key, Space) produced a real successful move request,
      not just a visual-only interaction. Both cross-column and
      within-column pointer drags confirmed via the board's real API
      response after the drop, not just the DOM.
Slice 4 (sprints) shipped:

- [x] **Sprint lifecycle designed and documented** — new ADR 0008:
      `planned` → `active` → `completed`, chosen with the owner over a
      minimal active/completed-only model (see the ADR's "Alternatives
      rejected" — the minimal model still needs a transition to reuse
      the active slot, so it saves no real complexity while losing the
      ability to plan ahead). New `sprints` table (`sprint_status` enum,
      `version` for optimistic concurrency, nullable `startDate`/
      `endDate`) and a nullable `issues.sprintId` FK (`onDelete: "set
      null"` — a sprint isn't a tenant boundary, so deleting one returns
      its issues to the backlog rather than deleting them). One
      migration, no backfill needed this time (unlike ADR 0007's
      `board_rank`): the column is nullable from creation.
- [x] **At most one active sprint per project, enforced by the
      database** — a partial unique index
      (`UNIQUE (project_id) WHERE status = 'active'`), not a
      service-layer check-then-write. `PATCH .../sprints/:id/start` is a
      conditional `UPDATE ... WHERE status = 'planned' AND version =
      $expected`; a second concurrent start hits the index violation,
      caught the same `isUniqueViolation()` way as duplicate project
      keys/label names and translated to a real `409
      sprint_already_active` — verified live (tried starting a second
      planned sprint while one was active, confirmed the clear error,
      not a raw 500) and with an automated concurrent-start race test.
- [x] `PATCH .../sprints/:id/complete` returns the sprint's remaining
      issues to the backlog in the same transaction as the status
      change, writing one `issue.sprint_removed` event per issue with
      `reason: "sprint_completed"` — the `reason` field is what lets the
      activity timeline phrase an automatic release differently from a
      manual drag-to-backlog, without a second event type. Verified
      live: completed an active sprint with an issue still in it,
      confirmed the issue reappeared in the backlog and its timeline
      read "moved this issue back to the backlog (Sprint 1 completed)".
- [x] New `PATCH .../issues/:issueId/sprint` (`{ version, sprintId:
      string | null }`, `null` = backlog) — an issue mutation, not a
      sprint one, same conditional-UPDATE-on-version shape as `move`
      (ADR 0007). Writes `issue.sprint_assigned`/`issue.sprint_removed`.
      New unpaginated `GET .../backlog` composes the whole working view
      in one call (`{ activeSprint, backlog, activeSprintIssues }`),
      same "see everything at a glance" precedent as `getBoard`.
- [x] New `ProjectSprintsPage` (`/projects/:projectId/sprints`) — a
      sprint-history list (name, status, Start/Complete buttons gated on
      status) plus a two-zone backlog/active-sprint drag surface. Drag
      via `@dnd-kit/core`'s plain `useDraggable`/`useDroppable` (not
      `@dnd-kit/sortable` — this page only needs container membership,
      not insert-before-this-card ordering, see ADR 0008), with the same
      dedicated-drag-handle fix `BoardCard` needed. Cross-linked from
      the board and list pages. Verified live end to end: created a
      sprint, started it, dragged an issue from the backlog into the
      active sprint and back via real pointer drags, a full
      keyboard-only pass (Tab to the handle, Space, arrow keys, Space —
      confirmed via dnd-kit's own live-region announcer text reaching
      "dropped over droppable area active-sprint"), and completed the
      sprint, watching its issue return to the backlog and the timeline
      update correctly — all against the real API, not mocked.

## Phase 6 — Real-time

Slice 1 (Socket.IO connection, handshake auth, org room) shipped:

- [x] New `apps/api/src/realtime/socket-server.ts` — `attachSocketServer(httpServer)`,
      a pure function of the server it's given (not a side effect of
      importing the module), so `index.ts` and this slice's own test both
      call it and can never drift into two different auth
      implementations. `index.ts` now builds a real `http.Server`
      (`createServer(app)`) instead of discarding `app.listen()`'s return
      value, since Socket.IO needs to attach to it directly.
- [x] Handshake auth reuses `verifyAccessToken()` — the same function
      `requireAuth` already calls, already a plain function with nothing
      Express-specific about it. Rejection is Socket.IO's own mechanism
      (`next(new Error(...))`, the client gets `connect_error`), not
      `AppError` — its HTTP status/code/details shape has nothing to map
      onto a socket handshake. Every rejection (missing token, invalid
      token, and `join:org` for a non-member) is logged server-side with
      structured `logger.warn` — **found live while verifying this
      slice**: the handshake-rejection path was originally silent
      server-side (only `join:org`'s rejection logged anything), an
      observability gap next to every other rejection path in this
      codebase; fixed before considering the slice done.
- [x] `join:org` is a client-emitted event with an acknowledgement
      callback, not automatic on connect. The handler re-runs the exact
      membership check `requireOrgMembership` does
      (`organizationsRepository.findMembership`) before calling
      `socket.join()` — the client-claimed org id is never trusted on
      its own, same defense-in-depth as every HTTP middleware here.
- [x] Reconnection re-authenticates with whatever token is current, not
      one captured at first connect: `socket.io-client`'s `auth` option
      is a function (`apps/web/src/shared/socket/socket-client.ts`),
      called fresh on every (re)connection attempt, reading whatever
      `token-store.ts` currently holds. `join:org` re-fires on every
      `connect` event too, since Socket.IO room membership doesn't
      survive a new underlying connection. **Verified live, not just
      assumed**: logged in, killed the API dev server outright while the
      browser tab stayed open, confirmed the client's own reconnect
      attempts (and their failures) logged live, restarted the API, and
      watched the client reconnect and re-join its org room automatically
      within seconds — no page reload, no new code beyond the reconnect-
      safe `auth` function and the existing `connect` handler.
- [x] `AuthContext.tsx`'s `login()`/`logout()` call `connectSocket()`/
      `disconnectSocket()` — the same lifecycle the access token itself
      already follows, not a new one.
- [x] Vite dev proxy gets a `/socket.io` entry with `ws: true` (off by
      default for a plain proxy entry) alongside the existing `/api`
      one, keeping "the browser only ever talks to one origin" true for
      sockets too.
- [x] New `socket-server.test.ts` — a real `http.Server` on an ephemeral
      port, the same `attachSocketServer()` production wiring uses, a
      real `socket.io-client` connection: valid token + real membership
      connects and `join:org` acks; missing/invalid token is rejected at
      handshake; valid token but no membership in the claimed org acks
      `{ ok: false }`.
- [x] **A real lockfile bug found and fixed while installing
      dependencies for this slice**: `pnpm-lock.yaml` had an incomplete,
      dangling resolution for `socket.io-client@4.8.4` (declared in the
      packages section with no matching dependency snapshot, left over
      from adding the package separately in two workspace directories),
      which left `apps/web/node_modules/socket.io-client` a broken
      symlink — `pnpm install`, `--force`, and `pnpm dedupe` all left it
      unfixed; only deleting and regenerating the lockfile from the
      package.json specs resolved it cleanly. Confirmed via
      `pnpm typecheck` succeeding afterward, not just the symlink
      existing.

No real-time *feature* yet — this slice is the walking skeleton
(mirrors Phase 1's role for the whole app) proving an authenticated,
tenant-scoped connection works end to end before slices 2-4 build on it.

Slice 2 (broadcast after commit + live board updates) shipped:

- [x] `createIssue`/`updateIssue`/`moveIssue` in `issues.service.ts` —
      until now a pure pass-through to the repository, as anticipated
      since Phase 3 slice 1 — now call the new `broadcastIssueChanged
      (projectId, issueId)` after the repository call resolves, and only
      on a real success (`update`/`move` check the repository's own
      `status` first; a conflict/not_found never actually changed
      anything worth broadcasting).
- [x] `broadcastIssueChanged` lives in `realtime/socket-server.ts`,
      backed by a module-level `ioInstance` singleton set inside
      `attachSocketServer()` (same pattern `db/client.ts` already uses)
      — **silently no-ops if no socket server was ever attached**,
      which is correct behavior for every HTTP-level test in this
      codebase (they drive `app` directly via supertest, no real
      `http.Server`, no sockets), not a workaround. Verified by the full
      existing test suite staying green untouched.
- [x] New `join:project`/`leave:project` socket events — same shape as
      slice 1's `join:org`: re-verifies the project actually belongs to
      an org the caller is a member of
      (`projectsRepository.findById`, the same check `requireProject`
      does over HTTP) before joining the room. Needed `socket.data` to
      also remember `organizationId` (set once, on a successful
      `join:org`) — the socket-side equivalent of
      `req.ctx.organizationId`.
- [x] New `apps/api/src/realtime/broadcast.test.ts` — a real `http.Server`
      wrapping the real `app` (not a bare server), driven by both
      `supertest` for genuine HTTP mutations and a real `socket.io-client`
      asserting `issue:changed` actually arrives in the right
      `project:{id}` room (and never in one the socket didn't join).
- [x] New `entities/issue/api/useLiveIssueUpdates.ts`, called from
      `ProjectBoardPage` and `ProjectDetailPage`: joins `project:{id}`
      on mount, leaves on unmount, invalidates `issueKeys.board`/`list`
      on `issue:changed`.
- [x] **A real race condition found and fixed via live testing, not
      assumed away** — twice. A fresh page load calls `connectSocket()`
      (which joins `org:{id}`) and mounts `useLiveIssueUpdates` (which
      joins `project:{id}`) almost simultaneously; the project join
      could reach the server and get rejected (`not_in_org`) before the
      org join's own ack had actually set `socket.data.organizationId`
      server-side — caught live with two real browser tabs, not
      predicted from reading the code. First fix attempt (reset a
      shared "org ready" promise inside the `connect` handler) still
      left the exact same gap open *before* the first `connect` event
      fired. Real fix: `whenOrgRoomReady()` in
      `shared/socket/socket-client.ts` is a promise reset **synchronously
      inside `connectSocket()` itself** (no gap before the first
      connect) and again on every `disconnect` (room membership is gone
      the instant a connection drops, not just "eventually" on the next
      reconnect) — anything that depends on the org room must await it,
      not just check `socket?.connected`.
- [x] Verified live end to end with two real browser sessions on the
      same project: a drag on one tab updated the other's board with no
      reload; creating an issue on one tab's list page appeared live on
      the other's board; and — the harder case — killing and restarting
      the dev API server while a tab stayed open confirmed it
      reconnected and rejoined **both** rooms automatically (server logs
      showing `join:org` then `join:project` in the correct order), with
      a real subsequent drag still broadcasting correctly afterward, not
      just the underlying connection coming back.
Slice 3 (live comments — `issue:{id}` room) shipped:

- [x] `broadcastIssueChanged(projectId, issueId)` now targets both
      `project:{id}` and `issue:{id}` in one emit (Socket.IO's chained
      `.to()` unions the rooms — a socket in both gets one copy, not
      two) — a field change from anywhere (the board, an edit) now also
      reaches anyone reading that exact issue's detail page, not just
      the board/list. No call site changed; `createIssue`/`updateIssue`/
      `moveIssue` already called it with both ids.
- [x] New `broadcastIssueCommented(issueId)` — a distinct event
      (`issue:commented`), only into `issue:{id}`: comments never render
      on the board/list, so project-room viewers have no reason to hear
      about them. `issues.service.ts`'s `addComment` calls it after the
      repository call resolves, same "after commit, only on real
      success" shape as the other three call sites.
- [x] New `join:issue`/`leave:issue` socket events, same verification
      shape as `join:project`: the client sends `{ projectId, issueId }`
      (both already in the URL), the server checks
      `socket.data.organizationId` then reuses the exact
      `issuesRepository.findById` check `requireIssue` runs over HTTP —
      never trusting the client-claimed ids alone.
- [x] New `entities/issue/api/useLiveIssueDetailUpdates.ts`, called from
      `IssueDetailPage`: joins `issue:{id}` on mount, leaves on unmount,
      invalidates `issueKeys.detail`/`events` on either `issue:changed`
      or `issue:commented`.
- [x] **A deeper version of slice 2's race condition, found live again**:
      slice 2's fix (a single Promise instance, reset on `connect`/
      `disconnect`) still had the same underlying flaw one level down —
      a caller that already attached `.then()` to the *old* pending
      promise is never woken once that promise is silently swapped for
      a new one, since reassigning the module variable doesn't reach an
      already-issued reference. React StrictMode's dev-only rapid
      connect/disconnect churn on a fresh page load made this the
      *common* case for `join:issue`, not a rare edge case — proven by
      a direct, hook-free manual `join:issue` call (no intervening
      disconnect) succeeding every time while the app's own hook
      silently never joined. Root-caused by counting `"joined issue
      room"` log lines across a full run (zero from the app, one from
      the manual test), not guessed at. Real fix: `whenOrgRoomReady()`
      in `shared/socket/socket-client.ts` is now a resolver *queue*
      against a plain boolean flag, not a single swapped `Promise` —
      correct no matter how many connect/disconnect cycles happen
      between a caller asking and readiness actually being achieved.
- [x] Verified live end to end with two real browser sessions on the
      same issue's detail page: a comment posted on one appeared live
      on the other with no reload; separately, dragging that issue's
      card on the board (a different tab) live-updated the detail
      page's status badge *and* timeline, proving the dual-room
      broadcast; and killing/restarting the dev API server with a
      detail page open confirmed it reconnected and rejoined **both**
      `org:{id}` and `issue:{id}` automatically, with a subsequent
      comment still broadcasting correctly afterward.
Slice 4 (presence on an issue — last slice in this phase) shipped:

- [x] A genuinely different shape from slices 1-3: ephemeral, in-memory
      only — `Map<issueId, Map<socketId, {userId, name}>>` in
      `realtime/socket-server.ts`, no DB table, no `issue_events` row.
      Keyed by `socketId`, not `userId`, so two tabs from the same
      person are tracked independently (closing one correctly leaves
      the other's presence intact); the broadcast payload dedupes by
      `userId` so they still show as one entry, not "Alice, Alice".
- [x] `SocketData` gains a lazily-cached `name`, fetched once (reusing
      `auth.repository.ts`'s existing `findUserById`) the first time a
      socket actually joins an issue room — not in the connection-wide
      auth middleware, which would cost every board-only session a DB
      read it never needed.
- [x] Presence tracking rides on the existing `join:issue`/
      `leave:issue` handlers (slice 3), not new join events — joining
      adds the viewer and broadcasts `presence:update`; `leave:issue`
      and a real `disconnect` both remove it and broadcast again.
      `disconnect` scans every currently-tracked issue (no per-socket
      reverse index — not worth it at this app's real scale).
- [x] `useLiveIssueDetailUpdates` (already owning the `issue:{id}` join/
      leave lifecycle since slice 3) gained a return value instead of a
      new sibling hook — presence is one more kind of data arriving on
      a room this hook already manages.
- [x] **Verified live with a genuinely different second user**, not
      just two tabs of the same account — this app has no invite flow
      yet (every registration creates its own personal org), so a real
      second member of the same org was seeded directly (mirroring
      `socket-server.test.ts`'s own seeding pattern) and driven through
      a real `socket.io-client` connection with a real
      `signAccessToken()`-issued token. Confirmed the actual rendered
      page — not a simulated event — showed "Presence Viewer is also
      viewing" the moment that connection joined, and confirmed the
      line disappeared the instant a real `.disconnect()` call fired
      (not just a clean unmount/`leave:issue`), proving the
      disconnect-triggered cleanup path specifically. Also confirmed
      two tabs of the *same* account correctly show no presence line
      (dedup working as designed), and that navigating between two
      different issues leaves no stale presence flash.

**Phase 6 is now fully complete.**

## Phase 7 — Search, notifications, uploads

Slice 1 (Postgres full-text search: `tsvector` column, GIN index, ranking) shipped:

- [x] New generated `search_vector` column on `issues`
      (`GENERATED ALWAYS AS (...) STORED`), built through Drizzle's
      `customType<{ data: string }>({ dataType: () => "tsvector" })` —
      pg-core has no first-class `tsvector` type (confirmed by listing
      every file under `pg-core/columns/`), same "round-tripped as an
      opaque string, never parsed" precedent as `board_rank` (ADR 0007).
      Weighted `setweight(to_tsvector('english', coalesce(title, '')),
      'A') || setweight(to_tsvector('english', coalesce(description,
      '')), 'B')` — title outranks description in `ts_rank`.
- [x] New GIN index (`index(...).using("gin", ...)`) — the only index
      type that can serve a `tsvector @@ tsquery` match.
- [x] **Unlike `board_rank`, this needed no hand-written migration**:
      `board_rank`'s two-step migration (ADR 0007) existed only because
      of a `NOT NULL` backfill problem; a `GENERATED ALWAYS AS (...)
      STORED` column self-populates for every existing row the instant
      it's added. Verified, not just assumed — read `drizzle-kit
      generate`'s actual SQL output (matched the intended DDL exactly,
      zero hand-editing) and confirmed via direct `psql` inspection that
      existing rows self-populated with correct `'A'`/`'B'` weighting
      and real English stemming (e.g. "Issue" → `issu`, "Test" →
      `test`).
- [x] New org-scoped `search(organizationId, query, limit)` in
      `issues.repository.ts` — raw `sql` for both the `@@` match
      (`websearch_to_tsquery`, not `plainto_tsquery`, so quoted phrases
      and `-exclude` parse the way a real search box is typed) and the
      `ts_rank`-based `ORDER BY`, since Drizzle has no first-class
      full-text-search operator. New `GET
      /organizations/:organizationId/search?q=` (not nested under a
      project — a future command palette needs to search the whole org),
      reusing the same `view_issue` permission `listIssues` already
      requires. Fixed 25-result cap, no pagination — a relevance-ranked
      result set degrades fast past page one. `ts_rank`'s score never
      reaches the client, same `board_rank`-never-leaves-the-server
      precedent — `searchIssuesResponseSchema` reuses `issueSchema`
      as-is and `.parse()` strips it.
- [x] New `SearchPage` (`/search`, linked from `ProjectsPage`'s header)
      — `?q=` is the URL's source of truth, same convention
      `ProjectDetailPage`'s `?status=`/`?order=` already established.
      Results span every project in the org, so `IssueCard`'s
      `projectKey` is resolved per-result from the already-cached
      `useProjects()` list, same "no dedicated single-project fetch"
      pattern every other page uses.
- [x] Verified live end to end, not just via the automated repository
      test: created a title match and a separate description-only match
      for the same term and confirmed the title match ranked first in
      the real UI; confirmed a second, genuinely different organization
      never saw the first org's matching issue; confirmed a bookmarked
      `?q=...` URL reproduced the same results on a fresh full page load
      with zero prior interaction. Seeded 20,000 real rows via `psql`
      and ran `EXPLAIN ANALYZE` against the actual query — confirmed a
      `Bitmap Index Scan` on `issues_search_vector_idx`, not a
      sequential scan, then removed the seeded rows.

Slice 2 (command palette, ⌘K) shipped:

- [x] First real widget in the codebase — `widgets/command-palette/` had
      been empty since Phase 0. Mounted once in `App.tsx`, inside
      `BrowserRouter`, as a sibling of `ErrorBoundary`, so it survives
      every route change. Renders nothing while logged out (`useAuth()`
      has no `organization`).
- [x] Ctrl+K / Cmd+K globally toggles the palette (`preventDefault()` —
      Chrome/Edge otherwise bind Ctrl+K to the address bar search). No
      new dialog library: the native HTML `<dialog>` element gives a
      real top-layer overlay, `Escape`-to-close, and backdrop-click-to-
      close for free — Phase 3.5 deliberately skipped Radix, and one
      modal doesn't justify adding it now.
  - Reuses slice 1's search endpoint exactly as built via the existing
    `useSearch` hook — no backend or contract changes this slice.
    Input is debounced 250ms (`useDebouncedValue`, colocated, not
    `shared/lib` — no second consumer yet) before hitting `useSearch`.
  - Result rows are a dedicated `<button>`, not a reused `IssueCard` —
    the palette needs one selection model for both pointer clicks and
    arrow-key + Enter, which a real `<Link>` (IssueCard's own row)
    doesn't cover on its own.
  - Query and highlighted-row state reset on every close, whether that
    came from selecting a result, Escape, or a backdrop click (the
    dialog's own native `close` event) — reopening never shows a stale
    query.
- [x] **A real bug found and fixed via live testing, not assumed away**:
      the palette calls `useProjects()` unconditionally (hooks can't be
      called conditionally), passing an empty string for `organizationId`
      while logged out. `useProjects` had no `enabled` guard at all —
      every one of its five pre-existing callers renders inside
      `RequireAuth`, where `organizationId` is always real, so this had
      never mattered before. The palette is the first caller that can
      render pre-login, and the empty id fired a real request against
      `/organizations//projects` every few seconds (TanStack Query's
      background refetch), 404-ing in a loop — caught live via the
      browser console, not predicted from reading the code. Fixed by
      giving `useProjects` an optional `{ enabled }` param (defaults to
      `true`, so all five existing call sites are unaffected) and
      passing `enabled: !!organization` from the palette; confirmed live
      that the repeating 404 stopped and stayed stopped.
- [x] Verified live end to end, from more than one page: Ctrl+K opened
      the palette from both `/projects` and an issue detail page;
      typing returned the same ranked results `/search` itself returns
      for the same query (a title match still outranked a description-
      only match); clicking a result and a full keyboard-only pass
      (Ctrl+K, type, Arrow Down, Enter) both navigated to the right
      issue and closed the palette; reopening after a close always
      showed an empty query; and Ctrl+K while logged out did nothing —
      no dialog, and (after the fix above) no background request either.

Slice 3 (notifications derived from events; in-app feed + read state) shipped:

- [x] No assignee field exists on issues, so recipients are **event
      participants** — every distinct actor from an issue's past
      `issue_events` rows (the reporter is always in there via their own
      `issue.created` row), minus whoever just caused the new event.
      Confirmed with the owner before building — see the Phase 7 slice
      3 plan.
- [x] New `notifications` table (`{ id, userId, issueEventId, readAt,
      createdAt }`) — no `organizationId` column, joined through
      `issue_events → issues` for tenant scoping, same pattern
      `issue_events` itself already uses. New `notifications` module
      (its own table, its own mutation, its own recipient — unlike
      search, which stayed inside `issues` with no new state).
- [x] A new `writeIssueEvent()` helper in `issues.repository.ts`
      replaces all 7 previously-duplicated `tx.insert(issueEvents)`
      call sites (create, update, move, attachLabel, detachLabel,
      addComment, assignSprint) — inserts the event, then fans out one
      notification per participant in the same transaction via a single
      `INSERT ... SELECT DISTINCT ... WHERE actor_id != $current`.
      **Also reused by `sprints.repository.ts`'s `completeSprint()`**,
      which bulk-writes `issue.sprint_removed` events for every
      released issue — no carve-out for that bulk path, same "no
      carve-out" precedent `issue.moved`'s own audit event already set.
- [x] New `user:{userId}` Socket.IO room, auto-joined on connect (not a
      client-emitted `join:*` like org/project/issue — your own
      notifications are always wanted regardless of what page you're
      on). New `broadcastNotificationCreated(userId)`, called from
      `issues.service.ts`'s 7 mutating functions and
      `sprints.service.ts`'s `completeSprint`, strictly after each
      repository call resolves — never from inside the transaction,
      same rule Phase 6 slice 2 established for `broadcastIssueChanged`.
- [x] New endpoints: `GET .../notifications` (fixed 25-item cap, same
      deliberate scope cut as search's own cap), `GET
      .../notifications/unread-count` (a separate cheap indexed count,
      not derived from the capped list — which would silently
      undercount past 25 unread), `PATCH .../notifications/:id/read`,
      `PATCH .../notifications/read-all`. `requireOrgMembership` only,
      no `requirePermission` — these are always the caller's own data.
- [x] `describeEvent` (the "actor did X" sentence generator) moved out
      of `IssueDetailPage.tsx` into `entities/issue/lib/` — the
      notification feed is a second real consumer needing the same
      sentences for issues the viewer isn't currently looking at.
- [x] New `entities/notification` + `widgets/notification-bell` — a
      fixed-position bell (no persistent nav shell yet, same honest-
      placeholder reasoning as the command palette), a non-modal
      dropdown (not `<dialog>` — a notification panel shouldn't block
      the page the way the palette's modal search should), read-on-
      click-through plus an explicit "Mark all read", and
      `useLiveNotifications` invalidating on a live `notification:created`
      push.
- [x] **A real bug found and fixed live, the same class as slice 2's**:
      `useNotifications`/`useUnreadCount` fired with an empty
      `organizationId` while logged out (`NotificationBell` is mounted
      globally, the first two callers of these particular hooks that
      can render pre-login) — caught via the browser console
      (`/organizations//notifications` 404-looping), fixed with an
      `enabled: organizationId !== ""` guard on both.
- [x] Verified live end to end with a real second org member (seeded
      directly + added to the org's membership table, then driven via
      real authenticated HTTP requests — this app still has no invite
      flow): a comment from that second user updated the first user's
      bell badge and panel **live**, with no reload, from more than one
      page; clicking a notification navigated to the right issue and
      cleared it; "Mark all read" cleared the rest; the commenter's own
      unread count stayed at zero (no self-notification, confirmed
      against the real running system, not just the automated test);
      and killing/restarting the API dev server with a tab open
      confirmed it reconnected, rejoined `user:{id}` automatically, and
      a subsequent comment still delivered live afterward.

Slice 4 (file attachments: validation, storage, signed URLs) shipped:

- [x] "Signed URLs" usually implies real S3, but CLAUDE.md's stack list
      puts S3-compatible storage and Docker under Later (Phase 9).
      Confirmed with the owner: local disk + our own HMAC-signed,
      time-limited download tokens — the real signed-URL *concept*
      (tamper-proof, time-boxed access, no cookie/JWT) without pulling
      Phase 9's infra forward. New `lib/storage.ts` (`saveFile`/
      `deleteFile`/`readFileStream` + `signDownloadToken`/
      `verifyDownloadToken`, HMAC-SHA256 over `attachmentId:expires`,
      constant-time comparison via `timingSafeEqual`, 5-minute TTL) is
      the seam real S3 would swap in behind. New required
      `ATTACHMENT_SIGNING_SECRET` (`min(32)`, validated at boot) and
      `UPLOADS_DIR` env vars.
- [x] New `attachments` table, kept inside the `issues` module (a
      sub-resource like labels/comments, no recipient/read-state of its
      own — unlike notifications). Flat `{attachmentId}` filenames on
      disk; the original filename is untrusted input and never used in a
      path. `multer` 2.x (memory storage) parses uploads; its
      `fileFilter`/`limits` plus a small wrapper turn every rejection
      into a real `AppError` (`file_too_large`, `unsupported_file_type`),
      never a raw 500. Allowed types and the 10MB cap live in
      `packages/contracts` so the upload form pre-validates against the
      exact rule the server enforces. **Named limitation, not a silent
      gap**: the MIME type is client-supplied, not sniffed from bytes.
- [x] `GET .../attachments` mints a fresh `downloadUrl` per row (no
      separate "mint" endpoint). The download route itself
      (`GET /api/v1/attachments/:id/download?expires=&sig=`) is
      deliberately unauthenticated and token-gated — the signature *is*
      the authorization, same trust model as a real presigned URL.
- [x] Upload/delete go through the existing `writeIssueEvent` choke
      point (`issue.attachment_added`/`_removed`), so participants are
      notified with zero new wiring — the payoff of slice 3's helper.
- [x] **Real bugs found and fixed while building/verifying**, not
      assumed away: (1) the upload response was missing `uploaderName`
      (a plain `INSERT ... RETURNING` can't join `users`) — caught by
      the HTTP round-trip test as a 500, fixed with one in-transaction
      lookup. (2) **A slice 3 bug that only a page reload exposes**:
      `connectSocket()` replaced the socket on every call, and React
      StrictMode runs the auth refresh twice on reload, so the
      always-mounted `NotificationBell`'s `notification:created`
      listener ended up on a discarded socket instance and live pushes
      silently stopped (the badge was right after a refresh, wrong
      until then). Slice 3's live test logged in through the form,
      which calls it only once, so it never saw this. Fixed by making
      `connectSocket()` idempotent for an already-active connection to
      the same org; re-verified on the exact failing path (full reload,
      then another member's upload moved the badge 2 → 3 live).
- [x] Frontend: `apiUpload`/`apiDeleteVoid` in the shared client,
      `useAttachments`/`useDeleteAttachment` + `AttachmentList` in
      `entities/issue`, a new `features/upload-attachment`, mounted in
      `IssueDetailPage`. Plain list with a real `<a href>` download
      link (no inline previews); anyone with `manage_issue` can delete
      (role-based, not ownership-based, like labels/comments).
- [x] Verified: 18 files / 158 tests (new: signed-token sign/verify
      including a genuinely-valid-signature-but-expired case against an
      independent HMAC reimplementation, repository tests with
      notification fan-out, and an HTTP round trip through `supertest`
      `.attach()` proving the bytes survive). Live: a real upload
      appeared in the list and timeline; the signed URL returned the
      exact bytes with `Content-Disposition: inline`; a tampered
      signature and an expired timestamp both got 403; a disallowed
      type and an oversized file were rejected client-side *and*
      server-side (400, not 500); deleting removed the DB row, the
      physical file, and wrote the removal event. Not verified: a real
      browser file-chooser upload — Chrome refused the injected chooser
      ("Not allowed"), so the file was set on the input via
      `DataTransfer`, which drives the app's real `onChange` and upload
      code but is not a native picker.
- Known limits, named on purpose: no live cross-tab sync of the
  attachment *list* (only notifications push live); no inline image
  preview; local disk only until Phase 9.

**Phase 7 is now fully complete.**

## Phase 8 — Analytics

Planned as 5 slices: (1) foundations + throughput, (2) cycle time,
(3) sprint velocity, (4) breakdowns, (5) dashboard assembly + performance
(`EXPLAIN ANALYZE` at volume, date-range in the URL).

Slice 1 (foundations + throughput) shipped:

- [x] New ADR 0009: analytics are computed **on read from `issue_events`**
      (no rollup tables), transitions come from **replaying each issue's
      events in order** (`LAG`, default `todo`), "completed" = a real
      transition into `done` (reopened-then-redone counts again), UTC
      Monday weeks, issues counted not points, per project with the
      existing `view_issue` permission.
- [x] New `analytics` module (own module: a growing set of read-only
      cross-table queries), `GET .../projects/:projectId/analytics/
      throughput?weeks=` (default 12, max 52, zero-filled). The reason for
      the replay: `issue.updated` carries `status` even when it didn't
      change (the edit form resends it), so trusting the payload would
      invent completions.
- [x] Proved, not assumed: the two "trap" tests (unchanged-status edit,
      same-column reorder) were confirmed to **fail** when the
      previous-status check is removed, then restored. An independent
      plain-JS replay over the 100 seeded issues matched the SQL for all
      12 weeks (67 completions, 0 mismatches).
- [x] Seed: an idempotent "Analytics Demo" project (deterministic PRNG,
      100 issues, 234 backdated events incl. reopens and unchanged-status
      edits); `SEED_ORG_SLUG` seeds it into an existing org.
- [x] Frontend: Recharts on new semantic tokens `--color-chart-primary/
      -grid/-axis` (light + dark redefinitions), `entities/analytics`,
      `widgets/throughput-chart` (thin rounded bars, no legend for one
      series, text summary + "View as table", empty state), page at
      `/projects/:id/analytics`, linked from the project page.
- [x] Verified live (token-lean: `find`/`evaluate`, devtools closed): 11
      bars for 12 weeks (the zero week draws no bar; the table lists all
      12) and table values equal the verified numbers; bar contrast vs the
      surface 4.18:1 light / 6.89:1 dark (≥3:1 needed), grid deliberately
      ~1.2:1; colors change with `data-theme`; a project with no
      completions shows the empty state.
- **Not verified:** tooltip on real *mouse* hover — in this automated
  browser Recharts never reacted to pointer moves (it did receive them).
  The tooltip component itself is verified through keyboard focus (renders
  "Week of Jul 13 · 4 issues completed"). Worth one manual hover.
- Observed, not fixed (out of scope): a full reload right after login can
  bounce to `/login` (refresh-token rotation), as noted since slice 1.

Slice 2 (cycle time) shipped:

- [x] ADR 0010: cycle time = **first entry into in_progress -> first
      completion at or after it**, one value per issue. First entry so a
      bounce back doesn't reset the clock; first completion so a
      reopened issue isn't two cycles (that is throughput's job). Issues
      finished without ever being in progress have no cycle time and are
      reported as `withoutStart`, not hidden. Reported as median (leads),
      mean, p90 plus six fixed buckets (inclusive lower bound).
- [x] `GET .../analytics/cycle-time?weeks=`. The replay CTE from slice 1 is
      now one shared fragment used by both metrics, so they cannot
      disagree about what a transition is. The `?weeks=` schema was
      renamed `weeksQuerySchema` now that two endpoints share it.
- [x] Proved, not assumed: mutation checks — using MAX instead of MIN for
      the start fails 2 tests; dropping "completion must be at/after the
      start" fails the skip-then-reopen test with the exact bug it guards
      (a **-4 day** span). An independent plain-JS replay of the seeded
      project matched the SQL: 37 finished, median 3.5 / mean 3.4 / p90
      5.8 days, 27 withoutStart, identical bucket counts (4,12,20,1,0,0).
- [x] Frontend: `CycleTimeChart` (stat row led by the median, histogram on
      the same chart tokens, text summary + table view, empty state that
      explains the no-start case). Live: values equal the verified
      numbers, six labels, 4 bars for 4 non-empty buckets, light/dark bar
      colors differ, tooltip via keyboard, empty project shows the message.
- Still unverified, as in slice 1: the tooltip under a real mouse hover.
- Observation (seed, not a bug): 27 of 64 seeded finishes skip in-progress
  by design (40%), so the demo shows a large withoutStart.

Slice 3 (sprint velocity) shipped:

- [x] The open decision from the plan dissolved on reading the code:
      `complete()` already writes one `issue.sprint_removed` event per
      issue in the sprint, tagged `{ sprintId, reason: "sprint_completed" }`,
      in the same transaction and for every status. Those events **are** a
      snapshot of the sprint's membership at close, so no snapshot column, no
      membership replay, no ADR 0008 change, and it works retroactively.
      ADR 0011 records this.
- [x] `GET .../analytics/velocity?sprints=` (default 8, max 20): per
      completed sprint, `committed` (members at close) and `completed`
      (done **as of the close**, from the issue's own status events at or
      before its release event). Finishing an issue after the close does not
      credit the sprint; reopening it later does not remove the credit.
      Headline is the mean completed, computed in the service. A completed
      sprint with no issues shows 0 / 0.
- [x] Tests drive the **real** sprint and issue repositories so the events
      are the ones production writes (10 repository + 2 HTTP tests).
- [x] Caught a weak test by running the mutation checks: my first
      "status as of the close" test combined a late finish and a late reopen,
      which cancel to the same total, so a query using the status *now* still
      passed. Split into two tests; the "status now" break now fails 3 tests.
      A second break (dropping the `reason = sprint_completed` filter) passed
      at first because today a manual removal records `sprintId: null` and
      can never match a sprint; added a test with a manual removal that
      *does* name the sprint, so the filter is pinned. Both breaks now fail.
- [x] Seed: `seedSprintHistory` (six completed two-week sprints, assign +
      close-time release events mirroring the real code, done-ness decided
      from each issue's own events so some issues truly carry over). Runs
      when a project has no sprints, so it also upgrades orgs seeded earlier;
      re-running is a no-op.
- [x] Independent plain-JS replay of the seeded project matched the SQL
      for all six sprints: 0/0, 5/6, 6/11, 8/9, 6/10, 7/16 (average
      completed 5.3).
- [x] Frontend: `VelocityChart` (stats: average, latest, carried over;
      single-series bars; tooltip + table with completed / committed /
      carried over; empty state). Live: values equal the verified numbers,
      keyboard tooltip, table rows, light/dark bar colors differ, project
      with no sprints shows the empty message.
- Still unverified, as in slices 1-2: the tooltip under a real mouse hover.

Slice 4 (breakdowns) shipped:

- [x] ADR 0012: breakdowns are a snapshot of **current state**, so they read
      the `issues` / `issue_labels` tables directly. The rule this fixes in
      place: history (throughput, cycle time, velocity) comes from
      `issue_events`; the present comes from the tables. Plain Drizzle
      group-by queries, no raw SQL.
- [x] `GET .../analytics/breakdown`: issues per status (always three, in
      workflow order, zero-filled) and **open** issues per label (top 10 by
      count, ties by name). An issue with two labels counts under both, so
      label counts are not additive; the UI says so. Two gaps are reported,
      not hidden: `unlabeled` open issues and `hiddenLabels` past the top 10.
      Both tables are tenant-scoped (labels are org-level, so the label's org
      is filtered too, not just the issue's).
- [x] Mutation checks found real test gaps, fixed before shipping: dropping
      the project filter from the *unlabeled* query passed at first (my
      isolation test had no unlabeled issue elsewhere to leak), and removing
      the label-organization guard passed because normal code can never
      attach a foreign label. Added an unlabeled-elsewhere case and a test
      that inserts a bad cross-tenant row by hand. All five breaks now fail
      the matching test.
- [x] Seed: `seedLabels` (five labels, a deterministic ~65% of issues
      labelled, some with two), idempotent, runs on both the fresh and the
      upgrade path. Rows only, no label events (a seed shortcut).
- [x] Independent plain-JS tally matched the endpoint exactly: 100 issues,
      37 open; todo 24 / in progress 13 / done 63; bug 16, feature 7, docs 5,
      design 2; 14 unlabeled. The label counts sum to 30 over 23 labelled open
      issues, which is the non-additive rule visible in real data.
- [x] Frontend: `BreakdownCharts` (status columns, horizontal label bars, one
      chart color for both, text summaries, tables, notes for the gaps, empty
      states). Live: numbers match, keyboard tooltips, table rows, light/dark
      bar colors differ, project with no issues shows the empty message.
- Still unverified, as in slices 1-3: the tooltip under a real mouse hover.

- [x] Slice 5 — dashboard assembly, date range in the URL, query
      performance at volume
  - `?weeks=` (4/12/26/52, default 12) drives throughput and cycle time;
    `?sprints=` (4/8/12, default 8) drives velocity. Defaults are kept out
    of the URL; unknown values fall back to the default. Breakdowns are a
    snapshot, so no range. Layout: throughput full width, cycle time and
    velocity side by side from `lg`, breakdowns full width.
  - Performance, measured on a throwaway project (20,000 issues, 43,600
    events, 12 sprints, median of 7 runs after a warm-up), budget ~100 ms:
    | endpoint | before | after |
    |---|---|---|
    | throughput (12 / 52 wk) | 36.7 / 35.6 ms | 34.2 / 33.8 ms (unchanged) |
    | cycle time (12 / 52 wk) | 128.9 / 125.9 ms | 75.8 / 73.6 ms |
    | velocity (12 sprints) | 3871 ms | 18.7 ms |
    | breakdown | 17.4 ms | 18.0 ms (unchanged) |
  - Finding: Postgres materializes a CTE referenced more than once, and
    velocity's per-release correlated subquery then did a `CTE Scan` per
    row (`loops=3600`). The second reference came from an unused
    `transitions` CTE in the shared fragment. Fix: `status_events` is
    `NOT MATERIALIZED`, velocity no longer includes `transitions`, and
    cycle time is one query (FILTER bucket counts) instead of two replays.
    No index or schema change was needed, so no new ADR.
  - Throwaway data deleted; dev DB back to 212 issues / 731 events.
  - Verified live: `?weeks=52` and `?sprints=4` set the URL and selects,
    choosing the default removed the param, `?weeks=999&sprints=0` fell
    back to 12 / 8 with a working page, 52 weeks renders (26 x-axis ticks,
    zero weeks draw no bar).
  - Also verified live (throwaway QA account seeded via `SEED_ORG_SLUG`):
    a full page load of `?weeks=26&sprints=12` kept both selects and
    charts; 1400px light shows throughput full width with cycle time and
    velocity side by side; a fresh 420px dark render is one column with no
    horizontal scroll (all charts 309px wide).
  - Found and fixed afterward: at 420px the cycle-time bucket labels and
    velocity sprint labels overlapped. New `WrappingTick` in `shared/ui`
    splits a label at its last space when a category gets under 80px (so
    "1-3 days" becomes "1-3" over "days"); wide charts keep one line. The
    two axes are 40px tall to fit two lines. Checked at 420px: no overlap.
  - Retracted: "charts don't shrink on a live window resize" was a test
    artifact. The automated browser tab reports `document.hidden: true`, so
    it paints no frames and Recharts' ResizeObserver never fires until a
    screenshot forces one; after that the charts resized correctly both
    ways. Not an app bug.
  - Follow-up after the owner's real-mouse test: the first fix pinned every
    tooltip to one corner, which was not what the owner meant. Tooltips are
    now anchored per bar: above the hovered column (centered, above the plot
    so it never covers a bar) and, for the label chart, at the right edge of
    the hovered row. `AnchoredTooltip` + `anchoredTooltipProps` in
    `shared/ui`; animation off (Recharts eased it over 400 ms, the "slow
    follow"). Checked with real mouse moves on all five charts: the tooltip
    centre matched the hovered column/row within 1 px. It can overlap the
    stat row above a chart while hovering; accepted as transient.
  - Sprint selector now offers only choices that change something: with 6
    completed sprints it shows 4 and 8 (12 is hidden), and is hidden
    entirely with 4 or fewer. A stale `?sprints=` snaps to the nearest
    offered choice.
  - Real-mouse hover is now verified (it was keyboard-only in slices 1-4).

## Phase 9 — Production

- [ ] Docker + docker-compose (api, web, postgres, redis)
- [ ] Redis: caching, rate limits, Socket.IO adapter
- [ ] Background jobs + transactional email
  - Note (owner deferred, 2026-09-30): API tests that register users call
    the real Resend API with the real key from `.env` (no fake in
    `src/lib/email.ts`); Resend rejects the `example.com` test addresses, so
    nothing is delivered and tests still pass. Fix when this item is done:
    fake the email sender in the test setup, so tests need no network and
    can assert "a verification email was requested".
- [ ] GitHub Actions: lint → typecheck → test → build
- [ ] Playwright e2e on 3–4 critical flows
- [ ] Error monitoring
- [ ] **Seeded demo org + "Log in as demo"** — required, not optional
- [ ] OpenAPI generated from contracts, served at `/docs`
- [ ] README: architecture diagram, screenshots, decisions, setup
- [ ] Deploy

---

## Honest estimate

3–4 months part-time if the code is actually being read and understood.
Moving faster than that means the learning goal is being skipped.

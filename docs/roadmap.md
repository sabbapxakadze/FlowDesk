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
- [ ] Slice 2 — **Deferred.** Roll out the refreshed foundations and
      component visuals across every remaining screen. Not started; not
      planned until the flagged revisit point below.

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
- [ ] Slice 3 — real dnd-kit drag & drop with optimistic updates,
      replacing slice 2's buttons. Not started.
- [ ] Slice 4 — sprints: create, assign issues, backlog vs active. Not
      started.

## Phase 6 — Real-time

- [ ] Socket.IO with access-token handshake auth
- [ ] Rooms: `org:{id}`, `project:{id}`, `issue:{id}`
- [ ] Broadcast after commit; client reconciles TanStack Query cache
- [ ] Live comments, live status changes, presence on an issue

## Phase 7 — Search, notifications, uploads

- [ ] Postgres full-text search: `tsvector` column, GIN index, ranking
- [ ] Command palette (⌘K)
- [ ] Notifications derived from events; in-app feed + read state
- [ ] File attachments: validation, storage, signed URLs

## Phase 8 — Analytics

- [ ] Sprint velocity, cycle time, throughput, breakdowns
- [ ] Recharts dashboard on the semantic token palette

## Phase 9 — Production

- [ ] Docker + docker-compose (api, web, postgres, redis)
- [ ] Redis: caching, rate limits, Socket.IO adapter
- [ ] Background jobs + transactional email
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

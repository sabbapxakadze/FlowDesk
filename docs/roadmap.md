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

## Phase 4 — React depth

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
- [ ] Slice 3 — reusable table/list, empty states, skeletons, error
      boundaries, generalized beyond this one filtered-empty-state case.
      Not started.

## Phase 5 — Kanban board

- [ ] Fractional `board_rank` ordering
- [ ] Drag & drop (dnd-kit)
- [ ] Optimistic update with rollback on failure
- [ ] Sprints: create, assign issues, backlog vs active

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

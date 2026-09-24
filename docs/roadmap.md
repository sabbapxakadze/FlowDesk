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

## Phase 3.5 — Design system extraction

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
- [ ] Pull in shadcn-derived components into `shared/ui` as actually needed,
      rewritten onto our semantic tokens
- [ ] `/design-system` route documenting every token and base component

**Done when** dark mode is a ~20-variable change and every component so far
uses only semantic tokens. *(True as of slice 2 — confirmed by the grep in
slice 2's verification, not just assumed from the diff.)*

## Phase 4 — React depth

- [ ] TanStack Query conventions: keys, invalidation, staleness
- [ ] Server-side filter + sort + cursor/offset pagination
- [ ] URL as the source of truth for filter state
- [ ] Reusable table/list, empty states, skeletons, error boundaries
- [ ] Documented index + `EXPLAIN ANALYZE` before/after on the list query

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

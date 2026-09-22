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

## Phase 2 — Auth & multi-tenancy

Split into four ordered slices. Checkboxes below reflect Slices 1 and 2;
Authorization and Hardening & recovery are still open.

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
- [ ] Email verification + password reset (single-use hashed tokens)
- [ ] Rate limiting on auth routes
- [ ] Roles (Owner/Admin/Member/Viewer) → permission map → `requirePermission`
- [ ] `req.ctx` membership resolution middleware
- [ ] **Tenant isolation test suite**: prove Org A cannot read Org B
- [ ] Auth UI: login, register, verify, reset — React Hook Form + Zod

## Phase 3 — Issues core + event system

- [ ] `issues`, `labels`, `issue_labels`, `comments`, `issue_events` schema
- [ ] Human-readable keys (`AUTH-23`) via per-project counters
- [ ] Create / read / update issue, `version` column + 409 on conflict
- [ ] Domain events written in the mutation's transaction
- [ ] Activity timeline reading `issue_events`
- [ ] Comments
- [ ] Issue detail page

## Phase 3.5 — Design system extraction

Goal: by now there are real screens (auth forms, project list, issue detail,
activity timeline) to draw a design system *from*, instead of guessing one
upfront. This is a deliberate pause to consolidate, not new product features.

- [ ] Audit components built so far; extract repeated patterns into semantic
      tokens (`--color-bg-surface`, `--color-text-muted`, `--radius-card`, ...)
- [ ] Rewrite existing components to consume semantic tokens only, remove any
      raw Tailwind values that snuck in
- [ ] Pull in shadcn-derived components into `shared/ui` as actually needed,
      rewritten onto our semantic tokens
- [ ] Dark mode: redefine the semantic tier, verify nothing else needed to change
- [ ] `/design-system` route documenting every token and base component

**Done when** dark mode is a ~20-variable change and every component so far
uses only semantic tokens.

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

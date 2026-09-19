# Roadmap

Each phase is a set of **vertical slices**. A slice goes through every layer it
touches and ends in a reviewable, committable state. Work one slice at a time.

Mark slices `[x]` as they land. Update "Current phase" in `CLAUDE.md`.

---

## Phase 0 — Foundations

Goal: the rules, the skeleton, and the design language exist before any feature.

- [ ] pnpm workspace, TypeScript project references, shared eslint/prettier
- [ ] `apps/api` boots: Express, pino, request IDs, Zod-validated env, `/health`
- [ ] `apps/web` boots: Vite, React Router, Tailwind v4
- [ ] `packages/contracts` wired into both, proven by one shared schema
- [ ] Design tokens: primitive + semantic tiers, light/dark
- [ ] `/design-system` route rendering every token and base component
- [ ] `eslint-plugin-boundaries` enforcing FSD layers
- [ ] Hooks: typecheck + lint run automatically after edits

**Done when** both apps run, share one Zod schema, and a layer-boundary
violation fails the build.

## Phase 1 — Walking skeleton

Goal: prove the architecture end to end before building on it.

- [ ] Drizzle connected to local Postgres 16; first migration
- [ ] `organizations` + `projects` tables
- [ ] `GET /api/v1/projects` through routes → controller → service → repository
- [ ] Contract-typed response consumed by a TanStack Query hook
- [ ] Projects list page composed per FSD
- [ ] First integration test hitting a real database

**Done when** one trivial feature exists in every layer and is tested.

## Phase 2 — Auth & multi-tenancy

- [ ] `users`, `sessions`, `organizations`, `organization_members` schema
- [ ] Register + Argon2id hashing
- [ ] Login → short-lived access JWT (memory only) + opaque refresh cookie
- [ ] Refresh rotation with reuse detection (revoke session family)
- [ ] Logout, single-session and all-sessions
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

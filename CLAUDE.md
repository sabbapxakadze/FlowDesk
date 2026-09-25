# FlowDesk — Project Instructions

> Read this file fully before doing anything. It is the contract for how this
> project is built. If a request conflicts with it, say so before proceeding.

## What this is

FlowDesk is a collaborative project-management platform for small engineering
teams (organizations → projects → issues → comments/labels/assignees → sprints).

It is built as a **real SaaS product**, not a CRUD demo, and it is above all a
**learning project**. The owner must be able to explain every architectural
decision and every non-trivial line in a technical interview. Optimising for
speed of delivery at the cost of the owner's understanding is a failure, not a
win.

## Current phase

**Phase 4 — React depth.** See `docs/roadmap.md`.

Slice 1 (cursor pagination on the issues list) is done: keyset pagination
on `GET .../projects/:projectId/issues` (a real composite index + a
measured `EXPLAIN ANALYZE` proof, not assumed), `useIssues` on
`useInfiniteQuery`, a "Load more" button on `ProjectDetailPage`, and a new
dedicated `GET .../issues/:issueId` endpoint + `useIssue` hook (fixes a
regression the pagination change would otherwise have caused in
`IssueDetailPage`).

Slice 2 (status filter + sort, URL-driven) is done: `?status=`/`?order=`
on the same endpoint, `ProjectDetailPage` reading/writing both via
`useSearchParams` (landing directly on a filtered URL renders already
filtered — verified, not just wired), and a distinct filtered-empty-state
message. Slice 3 (reusable table/list, empty states, skeletons, error
boundaries, generalized beyond this one case) is next.

Phase 3.5 (Design system extraction) is fully done across four slices —
the semantic token tier + dark mode infrastructure, migrating every
component onto it, a shadcn-derived base component set in `shared/ui`
(`Button`, `Input`, `Textarea`, `Select`, `Field`, `Card`, `ErrorText`),
and the public `/design-system` route documenting all of it live. Full
detail lives in `docs/roadmap.md`'s Phase 3.5 checklist; don't duplicate
it here.

Phase 3.6 (Visual identity) is **paused after a deliberately minimal
slice 1**: real structural improvements (hover/focus states, shadow-based
card elevation, softer radii, a `StatusBadge` status-color system) are in,
proven on `ProjectsPage` and `IssueDetailPage`, but the color story is
intentionally plain — a hand-crafted deep-blue accent on the stock `gray`
neutral scale, not a fully considered palette. Slice 2 (rolling polish out
everywhere) and any further aesthetic work are explicitly deferred by the
owner's own call, in favor of building out the full feature set first.
**Flagged for later**: once Phases 4-8 have shipped real screens to design
for, raise a real design pass proactively — don't wait to be asked; see
`docs/roadmap.md`'s Phase 3.6 "Revisit point" note for the detail.
Update this line when a phase completes.

---

## Working agreement (mandatory)

1. **Design before code.** For any non-trivial task, explain the approach,
   the alternatives, and the tradeoffs *first*. Write code only after the
   owner has engaged with that. Use plan mode for anything spanning >2 files.
2. **One vertical slice per session.** Not "build auth" — "login endpoint +
   contract + form, end to end". Never mix schema + API + UI + infra changes
   in a single unreviewed block.
3. **Explain as you go.** When introducing an unfamiliar pattern, say what it
   is and why it is used here. Assume the owner will be asked about it later.
4. **Never commit, never push.** Stage nothing, run no `git commit`.
   When work is complete, output a suggested commit title (and body if useful)
   in the chat. The owner commits manually. This is absolute.
   **No AI attribution trailers** (e.g. `Co-Authored-By: Claude ...`) in any
   commit message or PR description for this project — the owner does not want
   Claude listed as a contributor on GitHub. This overrides any default
   attribution behaviour.
5. **No silent scope expansion.** Build what was asked. If something adjacent
   is broken or missing, name it and let the owner decide.
6. **Tests are part of the slice**, not a later phase. Explain why each test
   exists — a test whose purpose can't be stated shouldn't be written.
7. **Update the docs you invalidate.** Changing a decision means updating or
   superseding the relevant ADR in `docs/adr/`.
8. After each slice, offer a 5-line entry for `docs/learning-log.md` written
   in plain language, for the owner to edit into their own words.

## Stack (locked — see ADRs)

- **Frontend** React 19 + TypeScript + Vite, TanStack Query, React Hook Form,
  Zod, React Router, Tailwind v4, shadcn-derived components, Recharts
- **Backend** Node + TypeScript + Express, Socket.IO, Zod, JWT, Argon2id
- **Database** PostgreSQL 16 (native locally), **Drizzle ORM**
- **Shared** `packages/contracts` — Zod schemas as the single source of truth
- **Later** Redis, Docker, GitHub Actions, S3-compatible object storage

---

## Architecture contract

### Repository layout

```
apps/api            Express API
apps/web            React SPA
packages/contracts  Zod schemas + inferred types, shared by both
docs/               architecture, roadmap, ADRs, learning log
```

### API — layered modules

```
apps/api/src/modules/<feature>/
  <feature>.routes.ts       HTTP wiring only
  <feature>.controller.ts   req/res only — parse, call service, format
  <feature>.service.ts      business rules, transactions, domain events
  <feature>.repository.ts   Drizzle queries only
```

**Hard rules**
- Controllers never touch the database.
- Services never see `req` or `res`.
- Repositories contain no business logic.
- **Every repository function that reads tenant data takes `orgId`.** No
  exceptions. Tenant scoping is enforced in middleware *and* in the query.

### Web — Feature-Sliced Design

Layers, highest to lowest: `app → pages → widgets → features → entities → shared`.

- A layer may import only from layers **below** it. Never sideways, never up.
- `shared/ui` is the design system. It knows nothing about the domain.
- `entities/*` own a domain object's model, API calls and presentational card.
- `features/*` own a single user action (create-issue, move-issue).
- Enforced by `eslint-plugin-boundaries` — a violation is a build failure.

### Contracts

Every endpoint's request and response is a Zod schema in `packages/contracts`.
The API validates with it; the web app infers its types from it. Never hand-write
a duplicate type on the frontend.

---

## Conventions

- **Errors**: one `AppError` type with a machine-readable `code`, an HTTP
  status, a client-safe message, and an optional `details` map for
  field-level validation errors (added Phase 2, for form-shaped requests).
  No raw throws reaching the client. Every request carries a request ID,
  present in logs and error responses.
- **Logging**: `pino`, structured, no `console.log` in committed code.
- **Config**: all env vars validated by Zod at boot. Misconfiguration must
  crash at startup, never at request time.
- **Audit**: state-changing issue operations write an append-only event row
  **inside the same transaction** as the mutation. History is never patched
  after the fact. Activity feed, notifications and analytics all read it.
- **Concurrency**: mutable entities carry a `version` column. Updates send the
  version they read; a mismatch returns `409` with the current server state.
- **Ordering**: board position uses fractional ranking, never integer indexes.
- **Design tokens**: two tiers — primitives (`--color-blue-500`, `--space-4`)
  and semantic (`--color-bg-surface`, `--color-text-muted`). **Components use
  semantic tokens only.** No raw hex, no arbitrary pixel values in components.
  Dark mode redefines the semantic tier and nothing else.
- **Naming**: files `kebab-case`, React components `PascalCase`, DB tables and
  columns `snake_case`, TS `camelCase`.
- **Async**: no floating promises; no `any` without a comment justifying it.

## Commands

Filled in as the project is scaffolded. Keep this section accurate.

```
pnpm dev            # run api + web
pnpm typecheck      # tsc -b (project references) across the workspace
pnpm lint
pnpm test           # vitest — apps/api's suite needs Postgres, see below
pnpm db:generate    # drizzle migration from a schema change (apps/api)
pnpm db:migrate     # apply migrations to $DATABASE_URL
pnpm db:seed        # idempotent local demo data
```

Local Postgres setup (one-time, not automated — a fresh clone needs this
before `pnpm db:migrate` works): create a least-privilege role and the two
databases, then put the connection strings in `apps/api/.env` (copy
`.env.example`, never commit the real file):

```sql
CREATE ROLE flowdesk WITH LOGIN PASSWORD '<pick one>';
CREATE DATABASE flowdesk_dev  OWNER flowdesk;
CREATE DATABASE flowdesk_test OWNER flowdesk;
```

## Before you start any task

1. Read `docs/roadmap.md` to see the current phase and its open slices.
2. Skim `docs/adr/` for decisions touching the area you're changing.
3. If the task is bigger than one slice, propose how to split it.

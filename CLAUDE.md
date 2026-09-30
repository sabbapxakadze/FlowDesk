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

**Phase 8 — Analytics** is complete (5 slices, see
`docs/roadmap.md`). Phase 7 (Search, notifications, uploads) and Phase 6
(Real-time) are fully complete.

Phase 8 slice 1 (foundations + throughput) is done: ADR 0009 decides
analytics are computed on read from `issue_events`, with transitions found
by replaying each issue's events in order (an `issue.updated` can carry an
unchanged `status`, so the payload alone can't be trusted). New `analytics`
module and `GET .../analytics/throughput`; Recharts on new semantic
`--color-chart-*` tokens; `/projects/:id/analytics`. The trap tests were
proven to fail when the previous-status check is removed, and an
independent JS replay matched the SQL for all 12 seeded weeks. Not yet
verified: tooltip on a real mouse hover (verified via keyboard only).
Phase 8 slice 2 (cycle time) is done: ADR 0010 defines it as first
entry into in_progress to the first completion after it, with
never-started issues reported as `withoutStart` instead of hidden;
median leads, plus mean, p90 and six buckets. The replay CTE is now
shared with throughput. Mutation checks confirmed the tests catch a
MAX-instead-of-MIN start and a missing at-or-after-start guard, and an
independent JS replay matched the SQL exactly.
Phase 8 slice 3 (sprint velocity) is done: the open question (where past
sprint membership comes from, since `complete()` clears `issues.sprint_id`)
turned out to be already answered by `complete()`'s own
`sprint_completed` release events, which snapshot membership at close, so
there is no schema change (ADR 0011). "Done" is judged as of the close,
not today. The tests use the real sprint/issue repositories, and mutation
checks exposed and fixed a too-weak test before it shipped.

Phase 8 slice 4 (breakdowns) is done: ADR 0012 draws the line that history
(throughput, cycle time, velocity) comes from issue_events while the
present (issues per status, open issues per label) comes straight from the
tables. Label counts are not additive (an issue with two labels counts under
both) and the UI and ADR say so; unlabeled and hidden-label counts are shown
instead of dropped. Mutation checks again exposed two test gaps (unlabeled
isolation, and the label-organization guard needing a hand-inserted bad
row) which were fixed before shipping.

Phase 8 slice 5 (dashboard assembly, range in the URL, performance at
volume) is done, so **Phase 8 is complete**. `?weeks=` and `?sprints=` drive
the ranges (defaults out of the URL, bad values fall back). Measured at
20,000 issues: velocity was 3.9 s because Postgres materialized a CTE that a
correlated subquery rescanned per row; `NOT MATERIALIZED` plus dropping an
unused CTE brought it to ~19 ms, and merging cycle time's two replays into
one halved it to ~75 ms. No index or schema change. Chart tooltips are
anchored to the hovered column/row (checked with a real mouse), and the
sprint selector hides choices that would change nothing. Narrow (~420px)
x-axis labels wrap onto two lines instead of overlapping.

Slice 4 (file attachments) is done: local disk plus our own HMAC-signed,
time-limited download tokens, chosen with the owner because S3 and
Docker are explicitly Phase 9 in the stack list. New `lib/storage.ts`
is the seam real S3 would swap in behind; new `attachments` table inside
the `issues` module (a sub-resource like labels/comments); `multer`
(memory storage) with rejections translated to `AppError`s; allowed
types and the 10MB cap shared through `packages/contracts`. The download
route is deliberately unauthenticated and token-gated — the signature is
the authorization. Uploads/deletes go through the existing
`writeIssueEvent`, so participants are notified with no new wiring.
Named limits: MIME type is client-supplied, not byte-sniffed; no live
sync of the attachment list; no inline previews. **A real slice 3 bug
surfaced here, found only by reloading the page**: `connectSocket()`
replaced the socket on every call and React StrictMode runs the auth
refresh twice on reload, so the always-mounted notification bell's
listener sat on a dead instance and live pushes silently stopped (slice
3's live test logged in via the form, which only calls it once). Fixed
by making `connectSocket()` idempotent for an active same-org
connection; re-verified on the failing path. Live verification used a
`DataTransfer`-set file, not a native file chooser (Chrome refused the
injected chooser) — recorded honestly in the roadmap.

Slice 3 (notifications derived from events; in-app feed + read state)
is done: no assignee field exists on issues, so recipients are
**event participants** — every distinct actor from an issue's past
`issue_events` rows, minus whoever just caused the new one (confirmed
with the owner before building). A new `notifications` table (no
`organizationId` column, joined through `issue_events` → `issues` for
tenant scoping, same pattern `issue_events` itself already uses) and a
new `notifications` module — unlike search, this earned its own module
(its own table, its own mutation, its own recipient). A new
`writeIssueEvent()` helper in `issues.repository.ts` replaces all 7
previously-duplicated event-insert call sites and fans out one
notification per participant in the same transaction; also reused by
`sprints.repository.ts`'s `completeSprint()` for its bulk
`issue.sprint_removed` writes — no carve-out for that path. Live
delivery rides a new `user:{userId}` Socket.IO room, auto-joined on
connect (not a client-emitted `join:*` — your own notifications are
always wanted). New `entities/notification` + `widgets/notification-bell`
(a fixed-position bell, non-modal dropdown, read-on-click-through plus
"Mark all read"); `describeEvent` moved out of `IssueDetailPage.tsx`
into `entities/issue/lib/` as a second real consumer. **A real bug
found and fixed live, the same class as slice 2's**: `useNotifications`/
`useUnreadCount` fired with an empty `organizationId` while logged out
(the bell is mounted globally) — caught via the browser console, fixed
with an `enabled` guard on both. Verified live end to end with a real
second org member driven via authenticated HTTP requests: a comment
updated the first user's badge and panel live with no reload, from
more than one page; click-through and "Mark all read" both worked; no
self-notification; and an API kill/restart confirmed the socket
reconnected, rejoined `user:{id}`, and a subsequent comment still
delivered live afterward.

Slice 1 (Postgres full-text search backend + results page) is done: a
new generated `search_vector` column on `issues`
(`GENERATED ALWAYS AS (...) STORED`, built through Drizzle's
`customType()` since pg-core has no first-class `tsvector` type) plus a
GIN index, a new org-scoped `search()` repository function using raw
`sql` for `websearch_to_tsquery`/`ts_rank` (Drizzle has no first-class
full-text operator), a new `GET
/organizations/:organizationId/search?q=` endpoint, and a new
`SearchPage` at `/search` with `?q=` as the URL's source of truth.
**Unlike `board_rank` (ADR 0007), this needed no hand-written
migration** — a generated column self-populates every existing row the
instant it's added, no `NOT NULL` backfill problem to work around;
verified by reading the actual generated migration SQL and by direct
`psql` inspection of real rows' weighting and stemming, not just
assumed. Verified live end to end: a title match ranked above a
description-only match for the same term in the real UI, a second,
genuinely different organization never saw the first org's matching
issue, a bookmarked `?q=...` URL reproduced the same results on a fresh
page load with zero prior interaction, and `EXPLAIN ANALYZE` against
20,000 real seeded rows confirmed a `Bitmap Index Scan` on the new GIN
index, not a sequential scan.

Slice 2 (command palette, Ctrl+K/Cmd+K) is done: the first real widget
in the codebase (`widgets/command-palette/`, empty since Phase 0),
mounted once in `App.tsx` and rendering nothing while logged out. No
backend changes — reuses slice 1's search endpoint via the existing
`useSearch` hook, with a colocated `useDebouncedValue` (250ms) in
front of it. Uses the native `<dialog>` element rather than adding a
dialog library — Phase 3.5 deliberately skipped Radix, and one modal
doesn't justify it now. **A real bug found and fixed live**: the
palette's `useProjects()` call (needed to resolve each result's
`projectKey`) fired with an empty `organizationId` while logged out,
since `useProjects` had no `enabled` guard — none of its five other
callers needed one, they all render inside `RequireAuth`. This sent a
real request to `/organizations//projects` on a repeating background-
refetch loop, 404-ing every few seconds, caught via the browser
console rather than assumed safe. Fixed with an optional `{ enabled }`
param on `useProjects` (defaults to `true`, every existing caller
unaffected). Verified live end to end from two different pages: Ctrl+K
open/close, live-typed results matching `/search`'s own ranking, both
a full keyboard-only selection (Arrow Down, Enter) and a pointer click
navigating correctly and closing the palette, query resetting on
reopen, and confirming both the no-op and the fixed 404 loop while
logged out.

Slice 1 (Socket.IO connection, handshake auth, org room) is done: a
new `attachSocketServer()` wires an authenticated, tenant-scoped
connection onto the real `http.Server` (`index.ts` now builds one
explicitly instead of discarding `app.listen()`'s return value).
Handshake auth reuses `verifyAccessToken()` (the same function
`requireAuth` uses); `join:org` re-runs the real membership check
`requireOrgMembership` does before joining a room, never trusting the
client-claimed org id. Reconnection re-authenticates with whatever
token is current via a function-form `auth` option, verified live by
killing and restarting the dev API server with the browser tab left
open and watching it reconnect and re-join automatically. Two real bugs
were found and fixed while building/verifying this slice, not assumed
away: the handshake-rejection path was originally silent server-side
(now logged, matching every other rejection path in this codebase), and
a dangling lockfile entry for `socket.io-client` (only fixed by
regenerating `pnpm-lock.yaml` from scratch). No real-time feature yet —
this slice is the walking skeleton slices 2-4 (live board updates, live
comments, presence) build on.

Slice 2 (broadcast after commit + live board updates) is done:
`createIssue`/`updateIssue`/`moveIssue` now call a new
`broadcastIssueChanged(projectId, issueId)` after the repository call
resolves and only on real success, emitting into a new `project:{id}`
room (joined/left per-page via a new `useLiveIssueUpdates` hook, not
connection-scoped like `org:{id}`). The broadcast helper silently
no-ops when no socket server is attached — correct for every existing
HTTP-level test, not a workaround. **A real race condition found and
fixed live, twice**: a fresh page load's `join:org` and `join:project`
fire almost simultaneously, and the project join could reach the server
before the org join's ack had actually set `socket.data.organizationId`
— caught with two real browser tabs, not predicted from the code. The
first fix attempt still left a gap open before the very first `connect`
event; the real fix resets a `whenOrgRoomReady()` promise synchronously
inside `connectSocket()` itself (`shared/socket/socket-client.ts`), and
again on every `disconnect`. Verified live end to end with two browser
sessions: a drag and a create on one tab both appeared live on the
other with no reload, and — the harder case — killing and restarting
the dev API server with a tab left open confirmed it reconnected and
rejoined *both* rooms automatically, with a real subsequent drag still
broadcasting correctly afterward.

Slice 3 (live comments — `issue:{id}` room) is done: `broadcastIssueChanged`
now targets both `project:{id}` and `issue:{id}` in one emit (chained
`.to()` unions the rooms), and a new `broadcastIssueCommented` targets
only `issue:{id}` — comments never render on the board, so project-room
viewers don't need to hear about them. New `join:issue`/`leave:issue`
mirror `join:project`'s verification shape, and a new
`useLiveIssueDetailUpdates` hook wires `IssueDetailPage` to both events.
**A deeper version of slice 2's exact race condition, found live
again**: slice 2's fix (swap a single Promise on `connect`/`disconnect`)
still silently orphaned any `.then()` already attached to the *old*
promise instance the moment it got swapped — React StrictMode's
dev-only connect/disconnect churn made this the common case for
`join:issue`, not rare, proven by counting `"joined issue room"` log
lines across a full run (zero from the app's own hook, one from a
direct hook-free manual test). Real fix: `whenOrgRoomReady()` is now a
resolver *queue* against a plain boolean, not a single swapped Promise
— correct regardless of how many connect/disconnect cycles happen
in between. Verified live: a comment on one tab appeared live on
another; dragging the same issue's card on the board live-updated a
separate detail-page tab's status badge *and* timeline; and a full
API kill/restart with a detail page open confirmed it reconnected and
rejoined both `org:{id}` and `issue:{id}`, with a subsequent comment
still broadcasting correctly afterward.

Slice 4 (presence on an issue — last slice in this phase) is done: a
genuinely different shape from slices 1-3 — ephemeral, in-memory only
(`Map<issueId, Map<socketId, {userId, name}>>` in
`realtime/socket-server.ts`), no DB table, no `issue_events` row.
Presence rides on the existing `join:issue`/`leave:issue` handlers
rather than new events; `SocketData` gained a lazily-cached `name`
(fetched once, only by sessions that actually open an issue, reusing
`auth.repository.ts`'s existing `findUserById`). **Verified live with a
genuinely different second user**, not two tabs of the same account —
this app has no invite flow yet, so a real second org member was seeded
directly and driven through a real `socket.io-client` connection with a
real `signAccessToken()`-issued token. Confirmed the actual rendered
page (not a simulated event) showed "Presence Viewer is also viewing"
the moment that connection joined, and that the line disappeared the
instant a real `.disconnect()` fired — proving the disconnect-triggered
cleanup path specifically, not just a clean unmount. **Phase 6 is now
fully complete.**

Slice 1 (board data model + read-only board view) is done: `board_rank`
column (a Postgres `numeric`, never a float — see ADR 0007 for the whole
ranking scheme), a two-step nullable-add-then-backfill migration, a new
unpaginated `GET .../projects/:projectId/board` endpoint, and a new
read-only `ProjectBoardPage`. Also fixed a regression this slice's own
board view would otherwise have exposed: `update()`'s existing
status-change path now re-ranks an issue to the end of its new column.

Slice 2 (move endpoint — bisection + rebalancing) is done: `PATCH
.../issues/:issueId/move`, plain up/down/move-to-column buttons on
`BoardCard`. **Caught and fixed a real bug via live testing, not
assumption**: `numeric`'s `/` operator turned out not to be
unlimited-precision the way `+`/`-`/`*` are (Postgres computes a
heuristic ~16-significant-digit result scale for division) — the
original `MAX_RANK_SCALE = 20` was unreachable and would have let `/`
silently round two distinct ranks together before the rebalance safety
net ever fired. Fixed (now 10, with real margin) and verified live
against real seeded data via `psql`, not just the automated test — see
ADR 0007's updated Decision section for the full finding.

Slice 3 (real drag & drop with optimistic updates) is done: `@dnd-kit/
core` + `@dnd-kit/sortable` replace slice 2's buttons entirely, calling
the same `useMoveIssue` mutation from `onDragEnd`. **Another real bug
caught live**: an early version made the whole card (including its
title link) the drag handle, on the theory that `PointerSensor`'s
activation distance alone would disambiguate a click from a drag — it
didn't, completing a drag actually navigated to the issue detail page.
Fixed with a dedicated drag-handle button (the standard fix), which
needed `Card` converted to `forwardRef` for `useSortable`'s
`setNodeRef`. Optimistic update lives in `useMoveIssue`'s `onMutate`/
`onError` (TanStack Query's own mechanism, not a parallel local-state
layer). Verified live end to end: cross-column and within-column
pointer drags via the real API response, a mocked 409 confirming
rollback to the exact pre-drag state, and an actual keyboard-only pass
(focus, Space, arrow key, Space) producing a real successful move
request.

Slice 4 (sprints — the last slice in this phase) is done: new ADR 0008
designs the full `planned` → `active` → `completed` lifecycle (chosen
over a minimal two-state model with the owner — see the ADR), a new
`sprints` table with a **database-enforced** at-most-one-active-sprint
constraint (a partial unique index, not a service-layer check —
verified live and with a concurrent-start race test), and a nullable
`issues.sprintId`. `PATCH .../sprints/:id/complete` returns its
remaining issues to the backlog in the same transaction and tags their
`issue.sprint_removed` events with `reason: "sprint_completed"`, so the
timeline can tell an automatic release apart from a manual
drag-to-backlog. New `PATCH .../issues/:issueId/sprint` (assign/
unassign, same conditional-version-UPDATE shape as `move`) and a new
unpaginated `GET .../backlog` composing the whole working view in one
call. New `ProjectSprintsPage`: a sprint-history list with Start/
Complete actions, plus a backlog/active-sprint drag surface using
`@dnd-kit/core`'s plain `useDraggable`/`useDroppable` (membership only,
not `@dnd-kit/sortable`'s ordering — this page doesn't need insert-
before-this-card semantics, see ADR 0008). Verified live end to end:
created and started a sprint, dragged an issue between backlog and
active sprint both ways via real pointer drags and a full keyboard-only
pass, and completed the sprint, watching its issue return to the
backlog and the timeline update correctly — all against the real API.

Phase 4 (React depth) is **fully done** across three slices — every
bullet in its original checklist is covered: cursor pagination (slice 1,
a real composite index + measured `EXPLAIN ANALYZE` proof, `useIssues` on
`useInfiniteQuery`, a new dedicated `GET .../issues/:issueId` endpoint +
`useIssue` hook fixing a regression pagination would've caused in
`IssueDetailPage`), status filter + sort with the URL as the source of
truth (slice 2, `?status=`/`?order=` on the same endpoint,
`ProjectDetailPage` reading/writing both via `useSearchParams`), and
reusable list states + a real error boundary (slice 3, new `Skeleton`/
`EmptyState` primitives in `shared/ui`, reused the already-existing
`ErrorText` for query errors, and a class-component `ErrorBoundary`
wrapped once in `App.tsx` — this app had zero error boundaries before,
confirmed by actually throwing and watching it recover, not just reading
the code). Full detail in `docs/roadmap.md`'s Phase 4 checklist.

Phase 3.5 (Design system extraction) is fully done across four slices —
the semantic token tier + dark mode infrastructure, migrating every
component onto it, a shadcn-derived base component set in `shared/ui`
(`Button`, `Input`, `Textarea`, `Select`, `Field`, `Card`, `ErrorText`),
and the public `/design-system` route documenting all of it live. Full
detail lives in `docs/roadmap.md`'s Phase 3.5 checklist; don't duplicate
it here.

Phase 3.6 (Visual identity) **restarted 2026-09-30**: slice 2a (design
foundation) is done. The owner chose palette A: warm `stone` neutrals, a
slate-teal accent, Inter for text and Newsreader for page titles and big
numbers only (ADR 0013). Only tokens and type changed; the palette is now a
value change in `semantic.css`/`primitives.css`. Contrast was measured on the
real tokens (the `border-input` gap it found was fixed in 2c). Slice 2b
(persistent navigation shell) is done: a layout route with a sidebar widget
(ADR 0014), the bell moved into it, and a mobile drawer. Slice 2c
(public screens and form controls) is done: an auth layout route, `/` now
redirects, control borders fixed to 3:1 (`stone-450`, ADR 0015), error text
darkened. Slice 2d
(page structure) is done: `Page`/`PageHeader` in `shared/ui` frame every
logged-in page, and the duplicated in-page links are gone. Slice 2e
(data screens) is done: one shared issue face, column headers with counts,
dashed empty states, sprint status badges, form surfaces, a timeline rail.
Slice 2f
(overlays and the design-system page) is done, so **Phase 3.6 is complete**:
the palette-A look (neutral gray after the owner found warm stone brownish, ADR 0016; icons from Lucide) is on every screen and overlay, `/design-system` documents it
with a theme switch, and a pre-existing command-palette bug (Esc after a
no-reload login left it stuck) was found and fixed. What follows
is the history of the earlier, paused slice 1: it was **paused after a
deliberately minimal slice 1**: real structural improvements (hover/focus states, shadow-based
card elevation, softer radii, a `StatusBadge` status-color system) are in,
proven on `ProjectsPage` and `IssueDetailPage`, but the color story is
intentionally plain — a hand-crafted deep-blue accent on the stock `gray`
neutral scale, not a fully considered palette. Slice 2 (rolling polish out
everywhere) and any further aesthetic work are explicitly deferred by the
owner's own call, in favor of building out the full feature set first.
(The flagged design pass has now been raised and started, see above.)
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

A Husky `pre-push` hook (`.husky/pre-push`) runs `pnpm typecheck && pnpm lint
&& pnpm test` before every `git push`, so Postgres must be running. It is
installed by `pnpm install` (the `prepare` script). Skip once with
`git push --no-verify`.

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

# Architecture

## System shape

```
React SPA (Vite)
   │  REST /api/v1        WebSocket (Socket.IO)
   ▼                      ▼
Express API ── services ── Drizzle ── PostgreSQL 16
   │
   └── (Phase 9) Redis: cache, rate limits, socket adapter
```

`packages/contracts` sits beside both: Zod schemas that the API validates
against and the SPA derives its types from.

## Why these choices

**PostgreSQL** — the domain is relational (orgs own projects own issues own
comments), and the interesting problems here are joins, indexes, transactions
and full-text search. A document store would hide exactly what this project
exists to teach.

**Drizzle over Prisma** — Drizzle's query API mirrors SQL, and its migrations
are readable SQL files. The abstraction is thin enough that learning Drizzle
means learning Postgres.

**Shared Zod contracts** — the largest bug class in full-stack work is drift
between what the server sends and what the client expects. One schema, two
consumers, compile-time failure on drift.

**FSD on the frontend** — a feature-based structure with enforced import
direction. It scales past the point where `components/`, `hooks/`, `utils/`
turns into a junk drawer, and it makes "where does this code go?" a question
with one answer.

## Authentication

- Passwords hashed with **Argon2id**.
- **Access token**: JWT, ~15 minutes, kept **in JavaScript memory only**.
  Not localStorage — an XSS bug there means token theft.
- **Refresh token**: opaque random bytes, **stored hashed** in `sessions`,
  delivered as `httpOnly; SameSite=Lax; Secure` cookie on a narrow path.
  Hashed at rest so a database leak doesn't yield usable sessions.
- **Rotation with reuse detection**: every refresh issues a new token and
  invalidates the old one. If an already-used token is presented, the session
  family is revoked — that's a stolen-token signal, and the response is to log
  the attacker *and* the victim out.
- Email verification and password reset use single-use hashed tokens with
  short expiry, and never reveal whether an address exists.

## Authorization

Two independent layers, deliberately redundant:

1. **Middleware** resolves the caller's membership into
   `req.ctx = { userId, orgId, role, permissions }` and rejects non-members.
2. **Repositories** take `orgId` in every tenant-scoped query.

If layer 1 is ever bypassed by a coding mistake, layer 2 still returns nothing.
A dedicated test suite asserts cross-organization reads fail.

## Events and audit

Every state-changing issue operation writes a row to the append-only
`issue_events` table **within the same transaction** as the mutation:

```
actor_id | issue_id | type | payload (jsonb) | created_at
```

Because it's one transaction, state and history can never disagree. After the
transaction commits, the event is published: Socket.IO broadcasts it to the
relevant rooms, and notification fan-out consumes it.

This single table backs the issue timeline, the notification feed, and the
analytics queries. It is the architectural centre of the product.

## Concurrent edits

Mutable entities carry an integer `version`. A client sends the version it
read; the update is `WHERE id = ? AND version = ?`. Zero rows affected means
someone else wrote first — the API returns `409` with the current server state
and the UI surfaces it rather than silently overwriting.

## Board ordering

Issues carry a fractional `board_rank`. Dropping an issue between two others
assigns a value between theirs, so a drag is a **single row update** instead of
reindexing the column. Ranks are rebalanced only when precision runs out.

## Real-time

Socket.IO authenticates in the handshake with the access token, then joins
rooms `org:{id}`, `project:{id}`, `issue:{id}`. The **server is the source of
truth**: the client applies an optimistic change to the TanStack Query cache,
sends the mutation, and rolls back on failure. Inbound socket events patch or
invalidate the same cache, so both paths converge on server state.

## Design tokens

```
primitive   --color-blue-500   --space-4   --text-sm      (raw values)
    ↓
semantic    --color-bg-surface --color-text-muted --radius-card
    ↓
components  use semantic tokens only
```

Dark mode redefines the semantic tier alone. Tailwind v4 exposes the tokens as
utilities via `@theme`. shadcn components are copied into `shared/ui` and
rewritten onto our semantic tokens, so the codebase stays on-system and owned.

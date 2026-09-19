# Learning log

One entry per slice, in your own words — not copied from the code or from an
assistant. If you can't write the entry, you haven't understood the slice yet.

Format:

```
## YYYY-MM-DD — <slice name>
What I built:
What was new to me:
Why it's done this way and not another way:
What I'd struggle to explain in an interview:
```

This file is your interview preparation. Treat it as a deliverable.

---

## 2026-09-19 — Phase 0: foundations (DRAFT — rewrite in your own words)

What I built:
A pnpm monorepo with three packages — an Express API, a React app, and a
shared `contracts` package that holds Zod schemas both sides use. Proved it
all works by having the API return a value the web app fetches, validates,
and renders. Set up a lint rule that blocks imports going the wrong direction
between the frontend's layers, and a hook that runs typecheck + lint
automatically every time a file changes.

What was new to me:
- Sharing one schema (Zod) between backend and frontend so they can't drift
  apart without a compile error.
- TypeScript "project references" — how a monorepo tells each package what
  it depends on and builds them in the right order.
- Why the ESM `.js` extension shows up on relative imports in the API even
  though the source files are `.ts`.
- That a lint rule can look correctly configured and still silently do
  nothing — the boundary rule needed two real fixes before it actually
  caught anything.

Why it's done this way and not another way:
- Contracts package instead of duplicating types by hand — so a change to
  the API response shape breaks the build instead of breaking silently.
- Tokens: only the base color/spacing scale now, nothing "semantic" yet —
  decided to wait until there are real screens to base that on instead of
  guessing.
- Health check isn't split into routes/controller/service/repository like
  a real feature will be — there's no logic or DB to layer, so that
  structure would just be empty folders.

What I'd struggle to explain in an interview:
- [fill this in honestly — if nothing comes to mind, that's the part to
  re-read before moving on]

---

## 2026-09-19 — Phase 1: walking skeleton (DRAFT — rewrite in your own words)

What I built:
A real read path through every layer: Postgres tables (organizations,
projects) with a migration, an API endpoint that goes routes → controller
→ service → repository, and a React page that fetches it with TanStack
Query and renders it. Also wrote the first automated test — one that hits
a real database, not a mock — and a seed script so there's actual data to
look at.

What was new to me:
- Drizzle: writing the schema in TypeScript, generating a SQL migration
  file from it, and applying that migration to a real database.
- Why the projects table has an index on organization_id and a unique
  index on (organization_id, key) instead of just a foreign key — the FK
  alone doesn't make "find all of org X's projects" fast, and doesn't stop
  two different orgs from colliding on a key they're each allowed to reuse.
- TanStack Query: a hook (`useProjects`) that fetches, caches, and tracks
  loading/error state, instead of hand-rolling that with useState/useEffect
  like the Phase 0 health check did.
- Least-privilege database roles: the app connects as a dedicated
  `flowdesk` role that owns exactly two databases, not as the Postgres
  superuser — same as what a real deployment needs, done from day one
  because it's cheap now and expensive to retrofit.
- Nesting the route under the organization
  (`/organizations/:id/projects`, not a flat `/projects`) because that id
  isn't an optional filter — it's what scopes the data to one tenant.

Why it's done this way and not another way:
- The integration test hits a real Postgres database instead of mocking
  the query — a mock would still pass if the WHERE clause were deleted.
  Proved this to myself by actually deleting it and watching the test fail,
  then putting it back.
- List responses come back as `{ data: [...] }`, not a bare array, so
  pagination can be added to that same envelope later without changing the
  shape every existing caller depends on.
- No create/edit endpoints yet — only reading. Organizations and projects
  exist because a seed script put them there. Writing them is a real
  feature (validation, who's allowed to) that belongs in its own slice.

What I'd struggle to explain in an interview:
- [fill this in honestly — if nothing comes to mind, that's the part to
  re-read before moving on]

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

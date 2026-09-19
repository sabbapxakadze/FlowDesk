# 0004 — Defence-in-depth tenant isolation

Status: Accepted — 2026-09-19

## Context

The single most damaging bug class in a multi-tenant product is one
organization reading another's data. A single forgotten `WHERE org_id = ?` is
enough, and it is invisible in normal use.

## Decision

Two independent enforcement layers:

1. Middleware resolves membership into `req.ctx` and rejects non-members.
2. Every tenant-scoped repository function takes `orgId` and includes it in the
   query — no exceptions, even where the caller has obviously already checked.

A dedicated integration test suite asserts that a member of Org A receives 404
or empty results for every Org B resource.

## Consequences

- Bypassing layer 1 by mistake still yields nothing from layer 2.
- Repository signatures are slightly noisier; an acceptable trade.
- The isolation test suite is direct, showable interview evidence.

## Alternatives rejected

- **Middleware only** — one missed route is a breach.
- **Postgres row-level security** — strong, but adds connection and role
  complexity that would obscure the fundamentals at this stage. Worth
  revisiting once the basics are solid.

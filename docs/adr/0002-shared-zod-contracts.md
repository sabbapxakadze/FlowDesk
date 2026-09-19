# 0002 — Shared Zod contracts package

Status: Accepted — 2026-09-19

## Context

The most common full-stack defect is drift between the server's response shape
and the client's assumption about it. Hand-written duplicate types drift
silently and are caught at runtime, by users.

## Decision

`packages/contracts` holds a Zod schema for every request and response body.
The API validates incoming data with it and types its handlers from it. The web
app infers its TypeScript types from the same schemas. Duplicate hand-written
API types on the frontend are forbidden.

## Consequences

- Drift becomes a compile-time failure in both apps.
- Validation and typing are defined once.
- Phase 9 can generate an OpenAPI document from these schemas for free.
- Cost: both apps depend on a shared package, so workspace build order matters.

## Alternatives rejected

- **tRPC** — excellent DX, but hides REST design, which is explicitly a
  learning goal here.
- **OpenAPI-first codegen** — heavier toolchain and more indirection while
  still learning the fundamentals.

# 0001 — PostgreSQL with Drizzle ORM

Status: Accepted — 2026-09-19

## Context

The domain is strongly relational and the project's purpose is to learn
relational data modelling properly. The owner already knows MongoDB.

## Decision

PostgreSQL 16 as the database, Drizzle ORM as the data-access layer.
Locally we use the natively installed Postgres 16; containerisation arrives in
Phase 9 as a deliberate exercise.

## Consequences

- Migrations are readable SQL files, reviewed like any other code.
- Query code looks like SQL, so learning the ORM means learning the database.
- Less hand-holding than Prisma: relation loading and N+1 avoidance are our
  responsibility, which is the intended lesson.

## Alternatives rejected

- **Prisma** — better DX, but abstracts SQL away; would teach Prisma, not Postgres.
- **MongoDB** — no new learning, and a poor fit for this domain's joins and
  constraints.

# 0005 — Transactional append-only event log

Status: Accepted — 2026-09-19

## Context

Issues need a trustworthy activity history, and notifications, real-time
broadcasts and analytics all need to know what changed. Deriving this from
mutable rows after the fact produces a history that can disagree with reality.

## Decision

Every state-changing issue operation appends a row to `issue_events`
(`actor_id`, `issue_id`, `type`, `payload` jsonb, `created_at`) **inside the
same transaction as the mutation**. The table is append-only. After the
transaction commits, the event is published to Socket.IO rooms and to
notification fan-out.

## Consequences

- State and history cannot diverge: both commit or neither does.
- Timeline, notifications and analytics become three reads of one source.
- Adding a new event type is additive and needs no schema migration.
- Cost: the table grows quickly and needs an index on `(issue_id, created_at)`;
  archiving is a future concern.
- This is **not** full event sourcing — the entity tables remain the read model.
  Chosen deliberately: most of the benefit, a fraction of the complexity.

## Alternatives rejected

- **Database triggers** — invisible from application code and hard to test.
- **Post-commit logging in the service** — a crash between commit and log
  silently loses history.
- **Full event sourcing** — disproportionate complexity for this project.

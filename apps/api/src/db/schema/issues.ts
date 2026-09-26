import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { projects } from "./projects.js";
import { users } from "./users.js";

export const issueStatus = pgEnum("issue_status", ["todo", "in_progress", "done"]);

/**
 * organizationId is denormalized here (not just projectId) so every
 * tenant-scoped query can filter on it directly instead of joining to
 * projects — same choice projects itself makes relative to organizations.
 * See CLAUDE.md's repository rule and ADR 0004.
 *
 * number is per-project (see projects.nextIssueNumber), not global — the
 * human-readable key (e.g. "AUTH-23") is projects.key + "-" + number,
 * computed on read, never stored.
 *
 * version starts unused (always 1) — slice 2 adds the optimistic-
 * concurrency PATCH that reads/writes it. Added now because it's schema,
 * not behavior.
 */
export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: issueStatus("status").notNull().default("todo"),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    // Added nullable (migration 0008), backfilled, then set NOT NULL
    // (migration 0009's hand-written SQL — no scalar DEFAULT can express
    // "append per (project, status) group"). See ADR 0007 for the whole
    // ranking scheme: numeric (exact decimal, never a float) so repeated
    // bisection between the same two neighbors never loses precision;
    // never parsed into a JS number, only ever round-tripped as a string.
    boardRank: numeric("board_rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("issues_organization_id_idx").on(table.organizationId),
    // Composite, not a bare project_id index: serves both the plain
    // project-scoped lookup and the keyset-paginated list query's
    // WHERE (created_at, id) < (cursor) ... ORDER BY created_at DESC, id
    // DESC — verified with EXPLAIN ANALYZE, see docs/roadmap.md's Phase 4
    // slice 1 entry. A separate single-column index would be redundant.
    index("issues_project_id_created_at_id_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    // Matches the board query's WHERE project_id = ? ORDER BY status,
    // board_rank, id exactly — index-only ordering, no sort step. As a
    // prefix, also serves a future per-column neighbor lookup (WHERE
    // project_id = ? AND status = ? ORDER BY board_rank). See ADR 0007.
    index("issues_project_id_status_board_rank_id_idx").on(
      table.projectId,
      table.status,
      table.boardRank,
      table.id,
    ),
    uniqueIndex("issues_project_id_number_unique").on(table.projectId, table.number),
  ],
);

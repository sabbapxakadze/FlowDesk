import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
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
    uniqueIndex("issues_project_id_number_unique").on(table.projectId, table.number),
  ],
);

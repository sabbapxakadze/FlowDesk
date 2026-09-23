import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { users } from "./users.js";

/**
 * The real source of truth for a comment's content — the timeline
 * (issue_events) carries a copy of the body for rendering without a
 * join, but this table is what a future edit/delete feature would touch.
 * Same "entity table stays the read model" reasoning ADR 0005 uses for
 * issues themselves.
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("comments_issue_id_idx").on(table.issueId)],
);

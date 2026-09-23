import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { labels } from "./labels.js";

/**
 * Pure junction table. The composite primary key is the uniqueness
 * constraint itself — attaching the same label to the same issue twice
 * is a duplicate-key error, no separate unique index needed.
 */
export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.issueId, table.labelId] })],
);

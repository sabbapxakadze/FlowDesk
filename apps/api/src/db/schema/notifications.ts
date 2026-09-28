import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { issueEvents } from "./issue-events.js";

/**
 * No organizationId column — a notification's tenant boundary is its
 * recipient's own userId. Listing/counting still joins through
 * issue_events -> issues for organizationId, same "join through, don't
 * denormalize" precedent issue_events itself already uses (it has no
 * organizationId column either — see listEvents/listLabelsForIssue in
 * issues.repository.ts). No backfill problem: a brand-new table,
 * readAt nullable from day one. See Phase 7 slice 3's plan.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issueEventId: uuid("issue_event_id")
      .notNull()
      .references(() => issueEvents.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The feed's read pattern: "my most recent notifications".
    index("notifications_user_id_created_at_idx").on(table.userId, table.createdAt),
    // The bell's read pattern: "my unread count" (WHERE read_at IS NULL).
    index("notifications_user_id_read_at_idx").on(table.userId, table.readAt),
  ],
);

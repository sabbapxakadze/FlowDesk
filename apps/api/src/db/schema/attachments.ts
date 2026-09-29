import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { users } from "./users.js";

/**
 * No organizationId column — every real read is already issue-scoped
 * (requireIssue already ran before any of these queries), same "join
 * through issues, don't denormalize" precedent comments/issue_events
 * already use. storageKey is opaque to clients — the on-disk filename
 * under lib/storage.ts's UPLOADS_DIR, never derived from the original
 * filename (which is untrusted user input). See Phase 7 slice 4's plan.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("attachments_issue_id_idx").on(table.issueId)],
);

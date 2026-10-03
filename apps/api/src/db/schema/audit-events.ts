import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/**
 * The organization audit log (ADR 0027). Append-only: rows are never updated or deleted by the
 * app, and each is written in the same transaction as the action it records.
 *
 * It stores SNAPSHOTS (the actor's name, the target's name, title or email at the time), not
 * foreign keys to the thing acted on: the point is to still make sense after a project, issue,
 * label or sprint is deleted. Only the organization is a real foreign key, so the log goes away
 * with the organization itself and never leaks across tenants.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // set null, not cascade: deleting a user must not erase what the organization did.
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: varchar("actor_name", { length: 255 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }).notNull(),
    // No foreign key on purpose (the target may be deleted). Null when there is no single id.
    targetId: uuid("target_id"),
    targetLabel: varchar("target_label", { length: 500 }).notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The read pattern: one organization's events, newest first, keyset-paged.
    index("audit_events_organization_id_created_at_id_idx").on(table.organizationId, table.createdAt, table.id),
  ],
);

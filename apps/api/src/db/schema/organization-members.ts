import { pgTable, pgEnum, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/**
 * The permission map and requirePermission middleware that actually
 * enforce these roles are a later slice — this is just the shape, assigned
 * the moment a membership row is created (every signup makes its creator
 * "owner" of their new organization). Same pattern as AppError in Phase 0:
 * the shape exists before the full behavior does.
 */
export const organizationRole = pgEnum("organization_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

/**
 * The join table between users and organizations. A composite primary key
 * — not a separate uuid id — because that's what actually is unique here:
 * one user can only have one membership row per organization. Making that
 * the primary key means Postgres enforces it, not an app-level check that
 * could be forgotten.
 */
export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

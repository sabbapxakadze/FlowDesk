import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

/**
 * Organization-scoped, not project-scoped — one label ("bug", "urgent")
 * is defined once per org and can be attached to any issue in any of
 * that org's projects. See the Phase 3 slice 3 plan's "Decisions" section.
 */
export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    // Hex color, e.g. "#FF5733" — validated at the contract layer.
    color: varchar("color", { length: 7 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A label name only needs to be unique within its own organization,
    // same shape as projects' (organizationId, key) uniqueness.
    uniqueIndex("labels_organization_id_name_unique").on(table.organizationId, table.name),
  ],
);

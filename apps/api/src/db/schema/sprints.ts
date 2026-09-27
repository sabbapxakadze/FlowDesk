import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, varchar, integer, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { projects } from "./projects.js";

export const sprintStatus = pgEnum("sprint_status", ["planned", "active", "completed"]);

/**
 * organizationId is denormalized here (not just projectId) for the same
 * reason issues does it relative to projects — every tenant-scoped query
 * filters on it directly. See CLAUDE.md's repository rule and ADR 0004.
 *
 * version follows CLAUDE.md's unconditional "mutable entities carry a
 * version column" convention — start()/complete() are conditional
 * UPDATEs guarded by it, same shape as issues.repository.ts's update().
 *
 * The partial unique index below is what actually enforces "at most one
 * active sprint per project" — the database is the source of truth for
 * this invariant, not application code (same pattern as the unique
 * project-key and label-name constraints elsewhere in this schema).
 */
export const sprints = pgTable(
  "sprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    status: sprintStatus("status").notNull().default("planned"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sprints_organization_id_idx").on(table.organizationId),
    index("sprints_project_id_idx").on(table.projectId),
    uniqueIndex("sprints_project_id_active_unique")
      .on(table.projectId)
      .where(sql`${table.status} = 'active'`),
  ],
);

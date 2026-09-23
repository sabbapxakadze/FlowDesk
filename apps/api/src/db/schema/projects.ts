import { pgTable, uuid, varchar, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

/**
 * Every project belongs to exactly one organization. organizationId is a
 * required foreign key, never nullable — there is no such thing as an
 * orphaned project. onDelete: "cascade" means deleting an organization
 * deletes its projects; that's a deliberate choice for this tenant
 * hierarchy, not an accident of the default.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    // Short project code used in issue keys later (e.g. "AUTH" -> AUTH-23).
    key: varchar("key", { length: 10 }).notNull(),
    // The number the *next* issue created in this project will get.
    // Incremented atomically (UPDATE ... RETURNING inside the create
    // transaction — see issues.repository.ts) so two concurrent creates
    // can never collide; see docs/adr and the Phase 3 slice 1 plan.
    nextIssueNumber: integer("next_issue_number").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every tenant-scoped query filters on organizationId (see
    // CLAUDE.md's repository convention) — this index is what makes that
    // filter cheap instead of a sequential scan as the table grows.
    index("projects_organization_id_idx").on(table.organizationId),
    // A project key only needs to be unique within its own organization,
    // not globally — two different orgs can both have a "WEB" project.
    uniqueIndex("projects_organization_id_key_unique").on(
      table.organizationId,
      table.key,
    ),
  ],
);

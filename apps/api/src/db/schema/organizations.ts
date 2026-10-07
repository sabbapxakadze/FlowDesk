import { index, pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

/**
 * The root of the tenant hierarchy — every other table eventually traces
 * back to an organization. See docs/architecture.md and ADR 0004.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    // URL-safe, unique identifier (e.g. for a future /org/<slug> route or
    // the demo-login flow in Phase 9). Not the primary key — ids are UUIDs
    // so they're never guessable or reused if a slug is renamed.
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    // A "Try the demo" copy (ADR 0044): the moment it is deleted. Null for every real organization. Set once, when the copy is made.
    demoExpiresAt: timestamp("demo_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The demo cleanup and the "how many demos are live" count both filter on it.
  (table) => [index("organizations_demo_expires_idx").on(table.demoExpiresAt)],
);

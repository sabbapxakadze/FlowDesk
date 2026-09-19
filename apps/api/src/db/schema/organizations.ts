import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

/**
 * The root of the tenant hierarchy — every other table eventually traces
 * back to an organization. See docs/architecture.md and ADR 0004.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  // URL-safe, unique identifier (e.g. for a future /org/<slug> route or
  // the demo-login flow in Phase 9). Not the primary key — ids are UUIDs
  // so they're never guessable or reused if a slug is renamed.
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

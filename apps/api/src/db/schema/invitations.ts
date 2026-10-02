import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations.js";
import { organizationRole } from "./organization-members.js";
import { users } from "./users.js";

/**
 * An invitation to join an organization (ADR 0024). Same token pattern as
 * auth_tokens and sessions: the raw token exists only in the link that is emailed
 * (and shown once to the inviter); only its sha256 hash is stored.
 *
 * Not deleted when used or revoked: acceptedAt / revokedAt record what happened, so
 * the history stays readable (and the audit log slice can use it).
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Stored already lower-cased and trimmed, like users.email.
    email: varchar("email", { length: 255 }).notNull(),
    role: organizationRole("role").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    // At most one OPEN invitation per person per organization, enforced by the database
    // (a partial unique index), not just a check in the service.
    uniqueIndex("invitations_one_open_per_email")
      .on(table.organizationId, table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
  ],
);

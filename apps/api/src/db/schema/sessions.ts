import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Append-only, one row per issued refresh token — same shape as
 * issue_events in ADR 0005: the history is the data, not a side effect of
 * it. A rotation never updates a row in place; it inserts a new row
 * sharing the same familyId and marks the old one revoked (revokedAt set).
 *
 * That's what makes reuse detection a single query: if a row's token hash
 * matches and revokedAt is already set, that token has been used before —
 * a stolen-token signal — so every still-valid row sharing its familyId
 * gets revoked too, not just this one request.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    // sha256 hex digest of the opaque refresh token — never the raw token
    // itself. See ADR 0003 and modules/auth/tokens.ts.
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Looked up on every single refresh call — has to be fast.
    uniqueIndex("sessions_refresh_token_hash_unique").on(table.refreshTokenHash),
    // Looked up when revoking a whole lineage (reuse detection, logout).
    index("sessions_family_id_idx").on(table.familyId),
  ],
);

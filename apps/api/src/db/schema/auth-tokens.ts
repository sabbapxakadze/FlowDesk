import { pgTable, pgEnum, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Email verification and password reset are structurally the same thing:
 * a single-use, hashed, expiring token tied to a user. One table with a
 * purpose, not two near-identical ones. Same shape as sessions'
 * refreshTokenHash — the raw token is only ever in the link sent by
 * email; only its sha256 hash is stored (see modules/auth/tokens.ts).
 */
export const authTokenPurpose = pgEnum("auth_token_purpose", [
  "email_verification",
  "password_reset",
]);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("auth_tokens_token_hash_unique").on(table.tokenHash)],
);

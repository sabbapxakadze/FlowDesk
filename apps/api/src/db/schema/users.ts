import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

/**
 * Email is stored already-lowercased by the service layer (see
 * auth.service.ts) — the unique index below only catches exact-string
 * duplicates, so normalization has to happen before every insert and
 * lookup, not just be trusted to have happened.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  // Profile (ADR 0028). All optional. avatarKey is the random part of the photo's public URL
  // (a new one on every upload); null means "show initials".
  jobTitle: varchar("job_title", { length: 100 }),
  bio: varchar("bio", { length: 300 }),
  avatarKey: varchar("avatar_key", { length: 64 }),
  // When the person pressed "Not now" on the "Finish your profile" card; null = not dismissed.
  profileNudgeDismissedAt: timestamp("profile_nudge_dismissed_at", { withTimezone: true }),
  // Null until a verify-email token is confirmed. Login is not gated on
  // this — see docs/adr and Phase 2 Slice 4's decisions. Tracked, not enforced.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

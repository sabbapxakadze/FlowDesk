import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  authTokens,
  organizationMembers,
  organizations,
  sessions,
  users,
} from "../../db/schema/index.js";

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export async function organizationSlugExists(slug: string): Promise<boolean> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org !== undefined;
}

/**
 * The three inserts — user, organization, owner membership — succeed or
 * fail together. Without the transaction, a failure after the user insert
 * already committed would leave a real account with no organization: a
 * broken login that can never actually do anything.
 */
export async function createUserWithOrganization(input: {
  email: string;
  passwordHash: string;
  name: string;
  organizationName: string;
  organizationSlug: string;
}) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, passwordHash: input.passwordHash, name: input.name })
      .returning();
    if (!user) throw new Error("Failed to create user");

    const [organization] = await tx
      .insert(organizations)
      .values({ name: input.organizationName, slug: input.organizationSlug })
      .returning();
    if (!organization) throw new Error("Failed to create organization");

    await tx.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
    });

    return { user, organization };
  });
}

export async function createSession(input: {
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}) {
  const [session] = await db.insert(sessions).values(input).returning();
  if (!session) throw new Error("Failed to create session");
  return session;
}

export async function findSessionByTokenHash(refreshTokenHash: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, refreshTokenHash))
    .limit(1);
  return session;
}

/**
 * Marks one session used/revoked without touching the rest of its family —
 * the normal outcome of a successful rotation (the old token is spent, the
 * new one just replaces it).
 */
export async function revokeSession(sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/**
 * Revokes every still-valid session sharing a family — used both for
 * deliberate logout and for reuse detection. A reused refresh token is a
 * stolen-token signal: the whole lineage dies, not just the one request
 * that triggered it.
 */
export async function revokeFamily(familyId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
}

export async function revokeAllForUser(userId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export type AuthTokenPurpose = "email_verification" | "password_reset" | "email_change";

export async function createAuthToken(input: {
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  newEmail?: string;
}) {
  const [token] = await db.insert(authTokens).values(input).returning();
  if (!token) throw new Error("Failed to create auth token");
  return token;
}

/**
 * "Valid" means all three at once: right purpose, not already used, not
 * expired. Any one of those failing is the same outcome to the caller —
 * see auth.service.ts's INVALID_TOKEN_ERROR — so there's no need to
 * distinguish them here.
 */
export async function findValidAuthToken(tokenHash: string, purpose: AuthTokenPurpose) {
  const [token] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return token;
}

export async function markAuthTokenUsed(id: string) {
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, id));
}

export async function verifyUserEmail(userId: string) {
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/**
 * Signs out every session of the person EXCEPT one family (the device that is changing the password): a changed
 * password should end the sessions that might belong to someone else, not the one in use.
 */
export async function revokeOtherFamilies(userId: string, keepFamilyId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), ne(sessions.familyId, keepFamilyId), isNull(sessions.revokedAt)));
}

/** The new address replaces the account's email and counts as verified: its owner just opened the link sent to it. */
export async function updateUserEmail(userId: string, email: string) {
  await db.update(users).set({ email, emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}

/** Retires every unused email-change link of a person (a newer request replaces older ones; a confirmed one ends them all). */
export async function invalidatePendingEmailChanges(userId: string) {
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, "email_change"), isNull(authTokens.usedAt)));
}

/** The address the person asked to change to and has not confirmed yet (the newest unexpired request), if any. */
export async function findPendingEmailChange(userId: string) {
  const [token] = await db
    .select({ newEmail: authTokens.newEmail })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, "email_change"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(authTokens.createdAt))
    .limit(1);
  return token?.newEmail ?? null;
}

export async function updateUserTimezone(userId: string, timezone: string | null) {
  await db.update(users).set({ timezone }).where(eq(users.id, userId));
}

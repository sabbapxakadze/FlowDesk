import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizationMembers, organizations, sessions, users } from "../../db/schema/index.js";

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

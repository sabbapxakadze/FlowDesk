import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { invitations, organizationMembers, organizations, users } from "../../db/schema/index.js";

type InvitableRole = "admin" | "member" | "viewer";

const OPEN = (organizationId: string) =>
  and(
    eq(invitations.organizationId, organizationId),
    isNull(invitations.acceptedAt),
    isNull(invitations.revokedAt),
  );

/**
 * The open (not accepted, not revoked) invitations of ONE organization, newest
 * first. Expired ones are included, flagged by the caller, so they can be seen and
 * revoked.
 */
export async function listOpen(organizationId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      invitedByName: users.name,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(users, eq(invitations.invitedBy, users.id))
    .where(OPEN(organizationId))
    .orderBy(desc(invitations.createdAt), desc(invitations.id));
}

/**
 * Creates the invitation. An OPEN invitation for the same email that has already
 * expired is revoked first (so it does not block a new one); one that is still valid
 * hits the partial unique index and the caller turns that into a 409.
 */
export async function create(input: {
  organizationId: string;
  email: string;
  role: InvitableRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}) {
  return db.transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          OPEN(input.organizationId),
          eq(invitations.email, input.email),
          lt(invitations.expiresAt, new Date()),
        ),
      );
    const [row] = await tx.insert(invitations).values(input).returning();
    if (!row) throw new Error("Failed to create invitation");
    return row;
  });
}

/** Revokes an open invitation of THIS organization; undefined when there is none. */
export async function revoke(organizationId: string, invitationId: string) {
  const [row] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(OPEN(organizationId), eq(invitations.id, invitationId)))
    .returning({ id: invitations.id });
  return row;
}

/** An invitation by the hash of its token, with the names the accept page shows. */
export async function findByTokenHash(tokenHash: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      organizationId: invitations.organizationId,
      organizationName: organizations.name,
      email: invitations.email,
      role: invitations.role,
      inviterName: users.name,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .innerJoin(users, eq(invitations.invitedBy, users.id))
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);
  return row;
}

/**
 * Accepting: mark the invitation used, create the account (email already verified,
 * because the invitation reached that address) and the membership, all in one
 * transaction. The UPDATE ... WHERE still-open is what makes a double submit or a
 * race safe: only one of two simultaneous accepts finds the invitation open.
 * Returns undefined if it was no longer open.
 */
export async function accept(input: {
  invitationId: string;
  organizationId: string;
  role: InvitableRole;
  email: string;
  name: string;
  passwordHash: string;
}) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(invitations.id, input.invitationId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });
    if (!claimed) return undefined;

    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("Failed to create user");

    await tx.insert(organizationMembers).values({
      organizationId: input.organizationId,
      userId: user.id,
      role: input.role,
    });

    const [organization] = await tx
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    if (!organization) throw new Error("Organization vanished");

    return { user, organization };
  });
}

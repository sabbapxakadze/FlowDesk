import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizationMembers, organizations, users } from "../../db/schema/index.js";

/**
 * The extraction point Slice 1's decisions flagged: "if organizations ever
 * need their own standalone operations, that's the moment to extract
 * them." Authorization needing a real membership lookup is that moment.
 */
export async function findMembership(userId: string, organizationId: string) {
  const [membership] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
      ),
    )
    .limit(1);
  return membership;
}

/**
 * Every user has exactly one organization today — the personal one
 * created at signup (see modules/auth/auth.service.ts's register). This
 * is a deliberate, temporary simplification: real multi-org support (an
 * org switcher) is future scope, not this slice.
 */
export async function findPrimaryOrganizationForUser(userId: string) {
  const [row] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return row;
}

/** An organization by id (name for emails and the accept page). */
export async function findOrganizationById(organizationId: string) {
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row;
}

/** Everyone in the organization, for the assignee picker. Scoped by organizationId. */
export async function listMembers(organizationId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(asc(users.name), asc(users.id));
}

/**
 * One member of THIS organization, or undefined (not a member, or a member of
 * a different organization). The assignment check relies on that distinction.
 */
export async function findMember(organizationId: string, userId: string) {
  const [row] = await db
    .select({ userId: users.id, name: users.name })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return row;
}

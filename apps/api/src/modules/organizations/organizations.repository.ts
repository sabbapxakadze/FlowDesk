import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizationMembers, organizations } from "../../db/schema/index.js";

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

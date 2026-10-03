import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issues, organizationMembers, organizations, users } from "../../db/schema/index.js";
import { writeIssueEvent } from "../issues/issues.repository.js";

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

type Role = "owner" | "admin" | "member" | "viewer";

/** Sets a member's role in THIS organization; undefined when they are not a member. */
export async function updateMemberRole(organizationId: string, userId: string, role: Role) {
  const [row] = await db
    .update(organizationMembers)
    .set({ role })
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .returning({ userId: organizationMembers.userId });
  return row;
}

/**
 * Removes the MEMBERSHIP, never the user: their comments, events, attachments and the
 * issues they reported belong to the user row and must stay. In the same transaction every
 * issue of this organization assigned to them becomes unassigned (version bumped, so an
 * open edit form is told it is stale) with an "issue.updated" event whose payload says why.
 * Quiet on purpose (notify: false): a bulk, system-caused change should not ping everyone
 * who ever touched those issues. Returns undefined when they were not a member, else the
 * affected issues so the caller can broadcast after the commit.
 */
export async function removeMember(input: { organizationId: string; userId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.userId),
        ),
      )
      .returning({ userId: organizationMembers.userId });
    if (!deleted) return undefined;

    const assigned = await tx
      .select({ id: issues.id, projectId: issues.projectId })
      .from(issues)
      .where(and(eq(issues.organizationId, input.organizationId), eq(issues.assigneeId, input.userId)));

    for (const issue of assigned) {
      await tx
        .update(issues)
        .set({ assigneeId: null, version: sql`${issues.version} + 1`, updatedAt: new Date() })
        .where(eq(issues.id, issue.id));
      await writeIssueEvent(
        tx,
        {
          issueId: issue.id,
          actorId: input.actorId,
          type: "issue.updated",
          payload: { assigneeId: null, reason: "member_removed" },
        },
        { notify: false },
      );
    }
    return { unassigned: assigned };
  });
}

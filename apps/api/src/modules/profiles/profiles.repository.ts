import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issueEvents, issues, organizationMembers, projects, users } from "../../db/schema/index.js";

export async function updateProfile(
  userId: string,
  input: { name: string; jobTitle: string | null; bio: string | null },
) {
  const [row] = await db
    .update(users)
    .set({ name: input.name, jobTitle: input.jobTitle, bio: input.bio, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return row;
}

/**
 * Swaps the user's photo key and returns the OLD one, in one transaction, so the caller knows
 * which file to delete. The old key is read with FOR UPDATE: two simultaneous uploads queue up
 * and each sees the other's key, so no file is left orphaned.
 */
export async function swapAvatarKey(userId: string, newKey: string | null): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ avatarKey: users.avatarKey })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    await tx.update(users).set({ avatarKey: newKey, updatedAt: new Date() }).where(eq(users.id, userId));
    return current?.avatarKey ?? null;
  });
}

/** Who currently owns this photo key (a replaced or removed key has no owner). */
export async function findUserIdByAvatarKey(key: string): Promise<string | undefined> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.avatarKey, key)).limit(1);
  return row?.id;
}

export async function listOrganizationIdsOfUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
  return rows.map((r) => r.organizationId);
}

/**
 * One member of THIS organization, or undefined (not a member, or a member of a different
 * organization). The join to organization_members is what keeps other organizations' people
 * unreachable by id.
 */
export async function findProfile(organizationId: string, userId: string) {
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      jobTitle: users.jobTitle,
      bio: users.bio,
      avatarKey: users.avatarKey,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return row;
}

type ActivityRow = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
  issueId: string;
  issueNumber: number;
  projectId: string;
  projectKey: string;
  issueTitle: string;
};

function encodeCursor(row: Pick<ActivityRow, "createdAt" | "id">): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { createdAt, id } = parsed as { createdAt?: unknown; id?: unknown };
    if (typeof createdAt !== "string" || typeof id !== "string") return null;
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? null : { createdAt: date, id };
  } catch {
    return null;
  }
}

/**
 * What one person did on issues of THIS organization, newest first, keyset-paged on
 * (created_at, id). Scoped by issues.organization_id in the query itself, so the same person's
 * events in another organization never appear. An issue that was deleted took its events with
 * it (ON DELETE CASCADE), so those lines are simply not here.
 */
export async function listActivity(
  organizationId: string,
  userId: string,
  options: { limit: number; cursor?: string },
): Promise<{ status: "ok"; items: ActivityRow[]; nextCursor: string | null } | { status: "invalid_cursor" }> {
  const conditions = [eq(issues.organizationId, organizationId), eq(issueEvents.actorId, userId)];
  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (!decoded) return { status: "invalid_cursor" };
    conditions.push(sql`(${issueEvents.createdAt}, ${issueEvents.id}) < (${decoded.createdAt.toISOString()}, ${decoded.id})`);
  }

  const rows = await db
    .select({
      id: issueEvents.id,
      type: issueEvents.type,
      payload: issueEvents.payload,
      createdAt: issueEvents.createdAt,
      issueId: issues.id,
      issueNumber: issues.number,
      projectId: projects.id,
      projectKey: projects.key,
      issueTitle: issues.title,
    })
    .from(issueEvents)
    .innerJoin(issues, eq(issueEvents.issueId, issues.id))
    .innerJoin(projects, eq(issues.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(issueEvents.createdAt), desc(issueEvents.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const items = hasMore ? rows.slice(0, options.limit) : rows;
  const last = items[items.length - 1];
  return { status: "ok", items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

export async function findNudgeState(userId: string) {
  const [row] = await db
    .select({
      jobTitle: users.jobTitle,
      bio: users.bio,
      avatarKey: users.avatarKey,
      dismissedAt: users.profileNudgeDismissedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

/** Idempotent: pressing "Not now" twice keeps the first time. */
export async function dismissNudge(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ profileNudgeDismissedAt: sql`COALESCE(${users.profileNudgeDismissedAt}, now())` })
    .where(eq(users.id, userId));
}

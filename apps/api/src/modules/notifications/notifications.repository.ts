import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issueEvents, issues, notifications, projects, users } from "../../db/schema/index.js";

// Same pattern issues.repository.ts's Tx alias uses — derived locally
// rather than shared, since both files independently import the same
// db singleton and the type is structurally identical either way.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const RESULT_LIMIT = 25;

/**
 * Participants = every distinct actor who has ever acted on this issue
 * (already captured in issue_events — the reporter is always in there,
 * via their own issue.created row), minus whoever just caused this new
 * event. One INSERT ... SELECT: DISTINCT naturally dedupes a user who
 * touched the issue more than once, and the exclusion naturally drops
 * self-notifications. Raw sql, not Drizzle's fluent insert-from-select
 * builder — same "drop to sql when the fluent builder can't express
 * something cleanly" precedent as nextRankSql/search() in
 * issues.repository.ts. Returns the notified user ids so the caller can
 * broadcast live after the transaction commits — see the Phase 7 slice
 * 3 plan's "Decisions" for why that must happen after commit, not here.
 */
export async function createForIssueEvent(
  tx: Tx,
  input: { issueEventId: string; issueId: string; excludeActorId: string },
): Promise<string[]> {
  // Recipients: everyone who has acted on the issue (participants), plus the
  // issue's CURRENT assignee even if they never acted (ADR 0021). UNION removes
  // duplicates; the assignee is read from the row as updated in this same
  // transaction, so a person who has just been assigned is notified by the very
  // event that assigned them.
  const result = await tx.execute<{ user_id: string }>(sql`
    INSERT INTO notifications (user_id, issue_event_id)
    SELECT recipients.user_id, ${input.issueEventId}::uuid
    FROM (
      SELECT actor_id AS user_id FROM issue_events WHERE issue_id = ${input.issueId}::uuid
      UNION
      SELECT assignee_id AS user_id FROM issues
      WHERE id = ${input.issueId}::uuid AND assignee_id IS NOT NULL
    ) AS recipients
    WHERE recipients.user_id != ${input.excludeActorId}::uuid
    RETURNING user_id
  `);
  return result.rows.map((row) => row.user_id);
}

const notificationColumns = {
  id: notifications.id,
  readAt: notifications.readAt,
  notificationCreatedAt: notifications.createdAt,
  eventId: issueEvents.id,
  eventActorId: issueEvents.actorId,
  eventActorName: users.name,
  eventType: issueEvents.type,
  eventPayload: issueEvents.payload,
  eventCreatedAt: issueEvents.createdAt,
  issueId: issues.id,
  issueTitle: issues.title,
  issueNumber: issues.number,
  projectId: projects.id,
  projectKey: projects.key,
};

// Shared join chain — every read here needs the same four-way join
// (notifications has no organizationId column, same "join through,
// don't denormalize" reasoning issue_events itself already uses; see
// the plan's "Decisions"), scoped to both the recipient and their org.
function baseQuery(organizationId: string, userId: string) {
  return db
    .select(notificationColumns)
    .from(notifications)
    .innerJoin(issueEvents, eq(notifications.issueEventId, issueEvents.id))
    .innerJoin(issues, eq(issueEvents.issueId, issues.id))
    .innerJoin(projects, eq(issues.projectId, projects.id))
    .innerJoin(users, eq(issueEvents.actorId, users.id))
    .where(and(eq(notifications.userId, userId), eq(issues.organizationId, organizationId)));
}

/** Fixed cap, no pagination — same deliberate scope cut as search's
 * slice 1 result cap, for the same reason (a feed degrades fast past
 * the first page; revisit only if actually needed). */
export async function listForUser(organizationId: string, userId: string) {
  return baseQuery(organizationId, userId).orderBy(desc(notifications.createdAt)).limit(RESULT_LIMIT);
}

export async function countUnread(organizationId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .innerJoin(issueEvents, eq(notifications.issueEventId, issueEvents.id))
    .innerJoin(issues, eq(issueEvents.issueId, issues.id))
    .where(
      and(eq(notifications.userId, userId), eq(issues.organizationId, organizationId), isNull(notifications.readAt)),
    );
  return row?.count ?? 0;
}

/** userId in the WHERE, not just the id — a notification's ownership
 * check IS its userId column, stronger scoping than organizationId
 * would give (see the plan's "Decisions"). "not_found" covers both a
 * genuinely missing id and one that belongs to a different user —
 * same "don't distinguish those two to the caller" choice every other
 * tenant-scoped 404 in this codebase already makes. */
export async function markRead(
  userId: string,
  notificationId: string,
): Promise<{ status: "marked_read" } | { status: "not_found" }> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  return updated.length > 0 ? { status: "marked_read" } : { status: "not_found" };
}

/** issue_event_id IN (a subquery over issue_events/issues, not
 * notifications itself) — avoids updating notifications while also
 * self-joining it in the same statement. */
export async function markAllRead(organizationId: string, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        sql`${notifications.issueEventId} IN (
          SELECT ${issueEvents.id} FROM ${issueEvents}
          INNER JOIN ${issues} ON ${issues.id} = ${issueEvents.issueId}
          WHERE ${issues.organizationId} = ${organizationId}
        )`,
      ),
    );
}

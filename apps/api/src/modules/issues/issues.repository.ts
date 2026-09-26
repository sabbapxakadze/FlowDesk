import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { comments, issueEvents, issueLabels, issues, labels, projects, users } from "../../db/schema/index.js";
import type { IssueStatus } from "@flowdesk/contracts";

type IssueRow = typeof issues.$inferSelect;

/** { createdAt, id } is the keyset — id breaks ties when two issues share
 * a createdAt millisecond (rare but real, e.g. a seed script). Opaque to
 * the client: base64 JSON, generated only from a row this server just
 * returned, never accepted as hand-built input beyond round-tripping it. */
function encodeCursor(row: Pick<IssueRow, "createdAt" | "id">): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== "string" ||
    typeof (parsed as { id?: unknown }).id !== "string"
  ) {
    return null;
  }
  const createdAt = new Date((parsed as { createdAt: string }).createdAt);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: (parsed as { id: string }).id };
}

/**
 * Scoped by both organizationId and projectId even though projectId alone
 * would already narrow correctly — the organizationId filter is what
 * makes this safe even if a caller ever got here without requireProject
 * having verified the project belongs to that org first (ADR 0004).
 *
 * Keyset pagination, not OFFSET: ordered by (created_at, id), matching
 * issues_project_id_created_at_id_idx exactly. The cursor condition uses
 * Postgres's row-constructor comparison `(created_at, id) < (cursor)`
 * rather than the equivalent `OR`-expanded form — verified with EXPLAIN
 * ANALYZE (see docs/roadmap.md's Phase 4 slice 1 entry) that only the
 * row-constructor form compiles to a real composite Index Cond; the OR
 * form still used the index for project_id but fell back to filtering
 * every row after the cursor by hand, scanning work proportional to page
 * depth instead of `limit`. Fetches one row past the requested limit to
 * know whether a next page exists without a second COUNT-style query.
 *
 * order flips both the ORDER BY direction and the cursor's comparison
 * operator together (desc: `<`/DESC, asc: `>`/ASC) — encapsulated here so
 * the two can't drift apart into an inconsistent combination. Postgres
 * btree indexes scan equally well in either direction, so `asc` reuses
 * the same composite index with no second index needed (verified with
 * EXPLAIN ANALYZE, see docs/roadmap.md's Phase 4 slice 2 entry). status,
 * when present, is a plain eq() — no separate index for it: it's a
 * 3-value filter applied on top of an already-selective project_id
 * equality, not worth a dedicated (or wider) index at this scale.
 *
 * "invalid_cursor" is a return value, not a thrown error — same modeling
 * as update()'s conflict/not_found below: an expected, client-triggerable
 * outcome the controller turns into a 400, not a bug.
 */
export async function listByProject(
  organizationId: string,
  projectId: string,
  options: { limit: number; cursor?: string; status?: IssueStatus; order: "asc" | "desc" },
): Promise<{ status: "ok"; items: IssueRow[]; nextCursor: string | null } | { status: "invalid_cursor" }> {
  const conditions = [eq(issues.organizationId, organizationId), eq(issues.projectId, projectId)];

  if (options.status) {
    conditions.push(eq(issues.status, options.status));
  }

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (!decoded) return { status: "invalid_cursor" };
    const comparator = options.order === "asc" ? sql.raw(">") : sql.raw("<");
    conditions.push(
      sql`(${issues.createdAt}, ${issues.id}) ${comparator} (${decoded.createdAt.toISOString()}, ${decoded.id})`,
    );
  }

  const orderFn = options.order === "asc" ? asc : desc;
  const rows = await db
    .select()
    .from(issues)
    .where(and(...conditions))
    .orderBy(orderFn(issues.createdAt), orderFn(issues.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const items = hasMore ? rows.slice(0, options.limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? encodeCursor(lastItem) : null;

  return { status: "ok", items, nextCursor };
}

/**
 * Scoped by organizationId + projectId + id, same defense-in-depth
 * reasoning as projects.repository.ts's findById. Used by requireIssue to
 * confirm a :issueId route param actually belongs to the project/org
 * already established earlier in the middleware chain.
 */
export async function findById(organizationId: string, projectId: string, issueId: string) {
  const [issue] = await db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.organizationId, organizationId),
        eq(issues.projectId, projectId),
        eq(issues.id, issueId),
      ),
    );
  return issue;
}

/**
 * COALESCE(MAX(board_rank), 0) + 1000, scoped like every other tenant
 * read here — a plain SQL expression, not a separate awaited query, so
 * it's computed atomically as part of whatever INSERT/UPDATE embeds it,
 * within the same transaction. No row-lock the way create()'s issue-
 * number counter needs one: two concurrent appends into the same column
 * landing on the same rank is a harmless cosmetic tie (listForBoard's
 * `id` tie-breaker still orders them deterministically), not a
 * correctness bug the way a duplicate issue number would be. See ADR
 * 0007 — this and every other rank value is a plain SQL expression,
 * never a JS number, to keep numeric's exact-decimal precision intact.
 */
function nextRankSql(organizationId: string, projectId: string, status: string) {
  return sql`COALESCE((SELECT MAX(${issues.boardRank}) FROM ${issues} WHERE ${issues.organizationId} = ${organizationId} AND ${issues.projectId} = ${projectId} AND ${issues.status} = ${status}), 0) + 1000`;
}

/**
 * One transaction: increment the project's counter, insert the issue with
 * the pre-increment value as its number, insert the issue_events row.
 * All three commit together or none do — see the Phase 3 slice 1 plan's
 * "Decisions" section for why the counter is safe under concurrent
 * creates (the UPDATE takes a row lock Postgres holds until commit).
 */
export async function create(input: {
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  reporterId: string;
}) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(projects)
      .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1` })
      .where(eq(projects.id, input.projectId))
      .returning({ nextIssueNumber: projects.nextIssueNumber });
    if (!updated) throw new Error("Failed to reserve an issue number");
    const number = updated.nextIssueNumber - 1;

    const [issue] = await tx
      .insert(issues)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        number,
        title: input.title,
        description: input.description,
        reporterId: input.reporterId,
        // New issues always start in "todo" (the column default) —
        // append to the end of that column, same helper update() uses
        // when a status edit moves an issue into a different column.
        boardRank: nextRankSql(input.organizationId, input.projectId, "todo"),
      })
      .returning();
    if (!issue) throw new Error("Failed to create issue");

    await tx.insert(issueEvents).values({
      issueId: issue.id,
      actorId: input.reporterId,
      type: "issue.created",
      payload: { title: issue.title },
    });

    return issue;
  });
}

/**
 * Conditional UPDATE, same shape as create()'s counter increment: the
 * WHERE clause's version check is the atomicity — Postgres only applies
 * the update if the row's version still matches what the caller read, so
 * two concurrent updates starting from the same version can never both
 * succeed. Zero rows affected means either the version moved (conflict)
 * or the row is gone (not_found, effectively unreachable today — no
 * delete exists yet — but cheap to handle correctly).
 *
 * When changes.status actually differs from the row's current status
 * (not just present in the payload — EditIssueForm always resends the
 * unchanged status alongside a title/description-only edit), board_rank
 * is also appended to the end of the new column. Otherwise a status
 * edit would leave the issue's rank meaningful only in its old column,
 * confusing on the board — see ADR 0007 / the Phase 5 slice 1 plan's
 * "Decisions" section. Needs one extra read (the current status) first,
 * since the usual single-statement conditional UPDATE has no other way
 * to know whether status is actually changing.
 */
export async function update(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  changes: Partial<{ title: string; description: string | null; status: IssueStatus }>;
  actorId: string;
}): Promise<
  | { status: "updated"; issue: typeof issues.$inferSelect }
  | { status: "conflict"; current: typeof issues.$inferSelect }
  | { status: "not_found" }
> {
  return db.transaction(async (tx) => {
    let boardRankChange: { boardRank: ReturnType<typeof nextRankSql> } | Record<string, never> = {};
    if (input.changes.status) {
      const [current] = await tx
        .select({ status: issues.status })
        .from(issues)
        .where(
          and(
            eq(issues.id, input.issueId),
            eq(issues.organizationId, input.organizationId),
            eq(issues.projectId, input.projectId),
          ),
        );
      if (current && current.status !== input.changes.status) {
        boardRankChange = {
          boardRank: nextRankSql(input.organizationId, input.projectId, input.changes.status),
        };
      }
    }

    const [updated] = await tx
      .update(issues)
      .set({ ...input.changes, ...boardRankChange, version: sql`${issues.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.organizationId, input.organizationId),
          eq(issues.projectId, input.projectId),
          eq(issues.version, input.expectedVersion),
        ),
      )
      .returning();

    if (updated) {
      await tx.insert(issueEvents).values({
        issueId: updated.id,
        actorId: input.actorId,
        type: "issue.updated",
        payload: input.changes,
      });
      return { status: "updated", issue: updated };
    }

    const [current] = await tx
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.organizationId, input.organizationId),
          eq(issues.projectId, input.projectId),
        ),
      );

    return current ? { status: "conflict", current } : { status: "not_found" };
  });
}

/**
 * Joined through labels (not a bare issueId filter) so organizationId is
 * still part of every tenant-scoped read, per CLAUDE.md's repository
 * rule — issue_labels itself has no organizationId column, labels does.
 */
export async function listLabelsForIssue(organizationId: string, issueId: string) {
  return db
    .select({
      id: labels.id,
      organizationId: labels.organizationId,
      name: labels.name,
      color: labels.color,
      createdAt: labels.createdAt,
      updatedAt: labels.updatedAt,
    })
    .from(issueLabels)
    .innerJoin(labels, eq(issueLabels.labelId, labels.id))
    .where(and(eq(issueLabels.issueId, issueId), eq(labels.organizationId, organizationId)));
}

/**
 * Confirms the label actually belongs to this org before attaching it —
 * defense in depth against a labelId from a different organization, same
 * reasoning as every other tenant-scoped write in this codebase. Attaching
 * the same label twice is rejected by issue_labels' composite primary key
 * (caught and converted to a 409 in issues.service.ts).
 */
export async function attachLabel(input: {
  organizationId: string;
  issueId: string;
  labelId: string;
  actorId: string;
}): Promise<{ status: "attached" } | { status: "label_not_found" }> {
  return db.transaction(async (tx) => {
    const [label] = await tx
      .select()
      .from(labels)
      .where(and(eq(labels.id, input.labelId), eq(labels.organizationId, input.organizationId)));
    if (!label) return { status: "label_not_found" };

    await tx.insert(issueLabels).values({ issueId: input.issueId, labelId: input.labelId });

    await tx.insert(issueEvents).values({
      issueId: input.issueId,
      actorId: input.actorId,
      type: "issue.label_added",
      payload: { labelId: label.id, labelName: label.name },
    });

    return { status: "attached" };
  });
}

/**
 * Idempotent: detaching a label that was never attached still returns
 * "detached" (the end state the caller wanted is already true) — no
 * issue_events row is written unless a row was actually removed.
 */
export async function detachLabel(input: {
  organizationId: string;
  issueId: string;
  labelId: string;
  actorId: string;
}): Promise<{ status: "detached" } | { status: "label_not_found" }> {
  return db.transaction(async (tx) => {
    const [label] = await tx
      .select()
      .from(labels)
      .where(and(eq(labels.id, input.labelId), eq(labels.organizationId, input.organizationId)));
    if (!label) return { status: "label_not_found" };

    const deleted = await tx
      .delete(issueLabels)
      .where(and(eq(issueLabels.issueId, input.issueId), eq(issueLabels.labelId, input.labelId)))
      .returning();

    if (deleted.length > 0) {
      await tx.insert(issueEvents).values({
        issueId: input.issueId,
        actorId: input.actorId,
        type: "issue.label_removed",
        payload: { labelId: label.id, labelName: label.name },
      });
    }

    return { status: "detached" };
  });
}

/**
 * The comment body lives in both comments (source of truth, future
 * edit/delete would touch this) and the issue_events payload (so the
 * timeline never has to join back to comments to render a "commented"
 * line) — see the Phase 3 slice 4 plan's "Decisions" section.
 */
export async function addComment(input: { issueId: string; authorId: string; body: string }) {
  return db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(comments)
      .values({ issueId: input.issueId, authorId: input.authorId, body: input.body })
      .returning();
    if (!comment) throw new Error("Failed to create comment");

    await tx.insert(issueEvents).values({
      issueId: input.issueId,
      actorId: input.authorId,
      type: "issue.commented",
      payload: { commentId: comment.id, body: comment.body },
    });

    return comment;
  });
}

/**
 * Joined to users for actorName (a timeline that just says a UUID
 * commented isn't readable) and to issues for organizationId scoping —
 * issue_events itself has no organizationId column, same shape as
 * listLabelsForIssue's join through labels.
 */
export async function listEvents(organizationId: string, issueId: string) {
  return db
    .select({
      id: issueEvents.id,
      issueId: issueEvents.issueId,
      actorId: issueEvents.actorId,
      actorName: users.name,
      type: issueEvents.type,
      payload: issueEvents.payload,
      createdAt: issueEvents.createdAt,
    })
    .from(issueEvents)
    .innerJoin(users, eq(issueEvents.actorId, users.id))
    .innerJoin(issues, eq(issueEvents.issueId, issues.id))
    .where(and(eq(issueEvents.issueId, issueId), eq(issues.organizationId, organizationId)))
    .orderBy(asc(issueEvents.createdAt));
}

/**
 * Every issue in the project, ordered by (status, board_rank, id) —
 * matching issues_project_id_status_board_rank_id_idx exactly, so the
 * board never needs to sort client-side or server-side beyond what the
 * index already provides. Unpaginated, deliberately: a board's whole
 * point is seeing everything at a glance, unlike the list view's
 * keyset-paginated listByProject. See the Phase 5 slice 1 plan's
 * "Decisions" section.
 */
export async function listForBoard(organizationId: string, projectId: string) {
  return db
    .select()
    .from(issues)
    .where(and(eq(issues.organizationId, organizationId), eq(issues.projectId, projectId)))
    .orderBy(asc(issues.status), asc(issues.boardRank), asc(issues.id));
}

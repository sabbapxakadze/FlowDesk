import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  attachments,
  comments,
  issueEvents,
  issueLabels,
  issues,
  labels,
  projects,
  sprints,
  users,
} from "../../db/schema/index.js";
import * as auditRepository from "../audit/audit.repository.js";
import * as notificationsRepository from "../notifications/notifications.repository.js";
import { issuePrioritySchema, type IssuePriority, type IssueStatus } from "@flowdesk/contracts";

type IssueRow = typeof issues.$inferSelect;

/** { createdAt, id } is the keyset — id breaks ties when two issues share
 * a createdAt millisecond (rare but real, e.g. a seed script). Opaque to
 * the client: base64 JSON, generated only from a row this server just
 * returned, never accepted as hand-built input beyond round-tripping it. */
type ListSort = "created" | "priority";

/** A priority-sorted cursor also carries the last row's priority; a created-sorted one does
 * not. decodeCursor insists on the shape that matches the requested sort, so a cursor from
 * one sort can never be replayed against another (it would skip or repeat rows). */
function encodeCursor(row: Pick<IssueRow, "createdAt" | "id" | "priority">, sort: ListSort): string {
  const payload =
    sort === "priority"
      ? { createdAt: row.createdAt.toISOString(), id: row.id, priority: row.priority }
      : { createdAt: row.createdAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(
  cursor: string,
  sort: ListSort,
): { createdAt: Date; id: string; priority?: IssuePriority } | null {
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
  const id = (parsed as { id: string }).id;
  const priority = (parsed as { priority?: unknown }).priority;
  if (sort === "priority") {
    const valid = issuePrioritySchema.safeParse(priority);
    return valid.success ? { createdAt, id, priority: valid.data } : null;
  }
  return priority === undefined ? { createdAt, id } : null;
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
  options: {
    limit: number;
    cursor?: string;
    status?: IssueStatus;
    priority?: IssuePriority;
    // A user id, or "unassigned".
    assignee?: string;
    /** Defaults to "created" (newest or oldest first by creation time). */
    sort?: ListSort;
    order: "asc" | "desc";
  },
): Promise<{ status: "ok"; items: IssueRow[]; nextCursor: string | null } | { status: "invalid_cursor" }> {
  const sort: ListSort = options.sort ?? "created";
  const conditions = [eq(issues.organizationId, organizationId), eq(issues.projectId, projectId)];

  if (options.status) {
    conditions.push(eq(issues.status, options.status));
  }

  // Same reasoning as status: a 5-value filter on top of the selective
  // project_id equality, no dedicated index.
  if (options.priority) {
    conditions.push(eq(issues.priority, options.priority));
  }

  if (options.assignee === "unassigned") {
    conditions.push(isNull(issues.assigneeId));
  } else if (options.assignee) {
    conditions.push(eq(issues.assigneeId, options.assignee));
  }

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor, sort);
    if (!decoded) return { status: "invalid_cursor" };
    const comparator = options.order === "asc" ? sql.raw(">") : sql.raw("<");
    // The whole key moves in one direction, so one row-constructor comparison is exact.
    // Postgres compares enum values in their declared order (none < low < ... < urgent).
    conditions.push(
      decoded.priority
        ? sql`(${issues.priority}, ${issues.createdAt}, ${issues.id}) ${comparator} (${decoded.priority}::issue_priority, ${decoded.createdAt.toISOString()}, ${decoded.id})`
        : sql`(${issues.createdAt}, ${issues.id}) ${comparator} (${decoded.createdAt.toISOString()}, ${decoded.id})`,
    );
  }

  const orderFn = options.order === "asc" ? asc : desc;
  const rows = await db
    .select()
    .from(issues)
    .where(and(...conditions))
    .orderBy(
      ...(sort === "priority"
        ? [orderFn(issues.priority), orderFn(issues.createdAt), orderFn(issues.id)]
        : [orderFn(issues.createdAt), orderFn(issues.id)]),
    )
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const items = hasMore ? rows.slice(0, options.limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? encodeCursor(lastItem, sort) : null;

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

/** The exact type db.transaction()'s callback receives — extracted
 * rather than hand-typed, so it can never silently drift from what
 * Drizzle actually infers. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * How many decimal places a bisected rank may need before the gap is
 * considered exhausted and the column gets rebalanced instead — see ADR
 * 0007. Checked via Postgres's own scale() function, never a JS-side
 * distance/epsilon comparison (that would reintroduce the float-
 * precision trap numeric exists to avoid).
 *
 * Deliberately well below what it might look like it could safely be:
 * unlike +, -, and *, numeric's / operator is NOT unlimited-precision in
 * Postgres — it computes a heuristic result scale targeting roughly
 * 16 significant digits total (integer part + decimal part combined),
 * shrinking as the integer part grows (empirically as low as 12 for a
 * 7-8 digit rank, confirmed directly against this project's own
 * Postgres 16 instance while building this). A threshold anywhere near
 * that ceiling would let two deep-enough bisections silently round to
 * the same stored value before this check ever caught it — exactly the
 * collision fractional ranking exists to prevent. 10 leaves real margin
 * below the observed worst case.
 */
const MAX_RANK_SCALE = 10;

/**
 * Renumbers every issue in a (project, status) column to fresh integer
 * multiples of 1000, oldest-first among ties — same shape as the slice 1
 * backfill migration, just scoped to one column and run inline instead
 * of as a migration. Small column sizes are assumed (this project's
 * real scale); a bulk single-statement renumber would be worth it at a
 * size where N sequential UPDATEs actually matters.
 */
async function rebalanceColumn(tx: Tx, organizationId: string, projectId: string, status: IssueStatus) {
  const rows = await tx
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(eq(issues.organizationId, organizationId), eq(issues.projectId, projectId), eq(issues.status, status)),
    )
    .orderBy(asc(issues.boardRank), asc(issues.id));

  for (const [index, row] of rows.entries()) {
    await tx
      .update(issues)
      .set({ boardRank: String((index + 1) * 1000) })
      .where(eq(issues.id, row.id));
  }
}

/**
 * Fetches a single issue's board_rank, scoped to organizationId +
 * projectId + status — the same query doubles as the "does this
 * neighbor actually belong to the target column" validation move()
 * needs (defense in depth, same reasoning as every other tenant-scoped
 * read here).
 */
async function fetchRankInColumn(
  tx: Tx,
  organizationId: string,
  projectId: string,
  status: IssueStatus,
  issueId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ boardRank: issues.boardRank })
    .from(issues)
    .where(
      and(
        eq(issues.id, issueId),
        eq(issues.organizationId, organizationId),
        eq(issues.projectId, projectId),
        eq(issues.status, status),
      ),
    );
  return row?.boardRank ?? null;
}

/**
 * The exact midpoint between prevIssueId's and nextIssueId's ranks (or
 * half of nextIssueId's, if prevIssueId is null — the target is the
 * first card in the column), computed by Postgres's exact decimal
 * arithmetic in one round trip alongside scale(), never parsed into a
 * JS number. Wrapped in trim_scale() (Postgres 13+): plain numeric
 * division pads its result to a generous fixed display scale (e.g.
 * `1500.0000000000000000` for an exact 3000/2) even when the value is
 * whole — checking scale() on that raw result would measure division's
 * padding, not the rank's actual precision, and trigger a rebalance far
 * too early. trim_scale() reduces to the minimal scale the value
 * actually needs, so both the stored rank and the exhaustion check
 * reflect real precision. If the trimmed candidate still needs more
 * decimal places than MAX_RANK_SCALE, the column is rebalanced and the
 * candidate recomputed against the now-current neighbor ranks —
 * re-fetched by id, since a rebalance changes every rank in the column
 * and the values read before it would be stale. Returns null if either
 * neighbor isn't actually in this (project, status) column (see
 * fetchRankInColumn).
 */
async function computeBisectedRank(
  tx: Tx,
  organizationId: string,
  projectId: string,
  status: IssueStatus,
  prevIssueId: string | null,
  nextIssueId: string,
): Promise<string | null> {
  const fetchBoth = async () => {
    const nextRank = await fetchRankInColumn(tx, organizationId, projectId, status, nextIssueId);
    if (nextRank === null) return null;
    if (prevIssueId === null) return { prevRank: null, nextRank };
    const prevRank = await fetchRankInColumn(tx, organizationId, projectId, status, prevIssueId);
    if (prevRank === null) return null;
    return { prevRank, nextRank };
  };

  const midpointOf = (prevRank: string | null, nextRank: string) =>
    sql`trim_scale(${prevRank ? sql`(${prevRank}::numeric + ${nextRank}::numeric) / 2` : sql`${nextRank}::numeric / 2`})`;

  const ranks = await fetchBoth();
  if (!ranks) return null;

  const midpoint = midpointOf(ranks.prevRank, ranks.nextRank);
  const result = await tx.execute<{ candidate: string; candidate_scale: number }>(
    sql`SELECT (${midpoint}) AS candidate, scale(${midpoint}) AS candidate_scale`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to compute a bisected board_rank");

  if (row.candidate_scale <= MAX_RANK_SCALE) {
    return row.candidate;
  }

  // Gap exhausted — rebalance the column, then recompute against the
  // now-current (freshly evenly-spaced) neighbor ranks. Both neighbors
  // are guaranteed to still be in this column post-rebalance (it only
  // renumbers, never reorders or removes rows) — safe to re-fetch by id.
  await rebalanceColumn(tx, organizationId, projectId, status);
  const freshRanks = await fetchBoth();
  if (!freshRanks) return null;
  const freshMidpoint = midpointOf(freshRanks.prevRank, freshRanks.nextRank);
  const freshResult = await tx.execute<{ candidate: string }>(sql`SELECT (${freshMidpoint}) AS candidate`);
  const freshRow = freshResult.rows[0];
  if (!freshRow) throw new Error("Failed to compute a bisected board_rank after rebalancing");
  return freshRow.candidate;
}

/**
 * Writes the issue_events row and fans out notifications to every
 * participant on this issue (every distinct actor from its past events,
 * minus whoever just caused this one) in the same transaction — see the
 * Phase 7 slice 3 plan's "Decisions". Replaces what used to be 7 near-
 * identical `tx.insert(issueEvents).values(...)` blocks across this
 * file. Returns the notified user ids so callers can broadcast live
 * *after* the transaction commits (never from inside it — a broadcast
 * mid-transaction could announce a change that then rolls back, same
 * rule Phase 6 slice 2 established for broadcastIssueChanged).
 *
 * Exported: sprints.repository.ts's completeSprint() also writes
 * issue_events rows (issue.sprint_removed, one per released issue) and
 * reuses this same helper rather than duplicating the fan-out logic —
 * no carve-out for a bulk path, same "no carve-out" precedent
 * issue.moved's audit event already established.
 */
export async function writeIssueEvent(
  tx: Tx,
  input: { issueId: string; actorId: string; type: string; payload: Record<string, unknown> },
  options: { notify?: boolean; alsoNotifyUserIds?: string[] } = {},
): Promise<string[]> {
  const [event] = await tx.insert(issueEvents).values(input).returning({ id: issueEvents.id });
  if (!event) throw new Error("Failed to write issue event");
  // notify: false writes the audit row but creates no notifications (comment
  // edits and deletes are quiet by design, see ADR 0019).
  if (options.notify === false) return [];
  return notificationsRepository.createForIssueEvent(tx, {
    issueEventId: event.id,
    issueId: input.issueId,
    excludeActorId: input.actorId,
    alsoNotifyUserIds: options.alsoNotifyUserIds,
  });
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

    // Participants are "every actor from this issue's past events" —
    // for the very first event, that set is always empty (nobody but
    // the reporter has acted yet, and they're excluded as the current
    // actor). writeIssueEvent's return is provably always [] here, so
    // there's nothing to bubble up — create() keeps its original bare-
    // issue return shape rather than wrapping it for a broadcast that
    // could never have a recipient.
    await writeIssueEvent(tx, {
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
 * Only fields that really differ from the stored row are written and logged
 * (EditIssueForm always resends title, description and status); a request that
 * changes nothing is a no-op: no version bump, no event, no notification.
 * When status really changes, board_rank
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
  changes: Partial<{
    title: string;
    description: string | null;
    status: IssueStatus;
    priority: IssuePriority;
    assigneeId: string | null;
  }>;
  // Extra, human-readable facts for the event payload that are not columns,
  // e.g. the assignee's name at the time (a name can change later; the
  // timeline should keep saying what was true then, like label names do).
  eventExtras?: Record<string, unknown>;
  actorId: string;
}): Promise<
  | { status: "updated"; issue: typeof issues.$inferSelect; notifiedUserIds: string[] }
  | { status: "conflict"; current: typeof issues.$inferSelect }
  | { status: "not_found" }
> {
  return db.transaction(async (tx) => {
    const scope = and(
      eq(issues.id, input.issueId),
      eq(issues.organizationId, input.organizationId),
      eq(issues.projectId, input.projectId),
    );

    const [before] = await tx.select().from(issues).where(scope);
    if (!before) return { status: "not_found" };
    if (before.version !== input.expectedVersion) return { status: "conflict", current: before };

    // Keep only the fields that really differ from the stored row. The edit
    // form resends title, description and status on every save, so without this
    // every save would bump the version and log "changed the title, changed
    // status, ..." for fields nobody touched. A description of "" and a stored
    // null are the same thing (the form shows null as an empty box).
    const changed = Object.fromEntries(
      Object.entries(input.changes).filter(([key, value]) =>
        key === "description"
          ? (before.description ?? "") !== ((value as string | null) ?? "")
          : before[key as keyof typeof before] !== value,
      ),
    ) as typeof input.changes;

    // Nothing actually changed: not a change, so no version bump, no event, no
    // notification. The version check above still ran, so a stale save is
    // still told it is stale.
    if (Object.keys(changed).length === 0) {
      return { status: "updated", issue: before, notifiedUserIds: [] };
    }

    // A status that really changes moves the issue to the end of its new
    // column (ADR 0007 / the Phase 5 slice 1 plan's "Decisions").
    const boardRankChange = changed.status
      ? { boardRank: nextRankSql(input.organizationId, input.projectId, changed.status) }
      : {};

    const [updated] = await tx
      .update(issues)
      .set({ ...changed, ...boardRankChange, version: sql`${issues.version} + 1`, updatedAt: new Date() })
      .where(and(scope, eq(issues.version, input.expectedVersion)))
      .returning();

    if (updated) {
      const notifiedUserIds = await writeIssueEvent(
        tx,
        {
          issueId: updated.id,
          actorId: input.actorId,
          type: "issue.updated",
          // The assignee's name only travels with a real assignee change.
          payload: { ...changed, ...("assigneeId" in changed ? input.eventExtras : {}) },
        },
        {
          // Whoever held the issue until now is told it moved on (ADR 0021): they
          // may never have acted on it, so the participant rule would miss them.
          alsoNotifyUserIds: "assigneeId" in changed && before.assigneeId ? [before.assigneeId] : [],
        },
      );
      return { status: "updated", issue: updated, notifiedUserIds };
    }

    // Someone else got in between the read above and this write.
    const [current] = await tx.select().from(issues).where(scope);
    return current ? { status: "conflict", current } : { status: "not_found" };
  });
}

/**
 * Moves an issue to a position within `status` — reordering within its
 * current column, or into a different one, are the same operation here.
 * See ADR 0007 / the Phase 5 slice 2 plan's "Decisions" for the request
 * shape: neither neighbor means "append to the end"; nextIssueId present
 * means "insert before that card" (prevIssueId, if given alongside it,
 * is the lower bound — omitted means the target is the column's first
 * card). prevIssueId alone is treated as "append" — it's only ever
 * meaningful paired with nextIssueId, and always recomputing MAX+gap for
 * a bare append is robust against a stale/wrong prevIssueId rather than
 * trusting it.
 *
 * Always writes an issue.moved event, even for a same-column reorder —
 * CLAUDE.md's audit convention has no stated exception for a "boring"
 * state change, and carving one out here would be an uncalled-for one.
 *
 * The rebalance inside computeBisectedRank (if triggered) commits even
 * if this move's own version check later fails: it happens before the
 * conditional UPDATE, in the same transaction, and a version conflict
 * is a returned value here, not a thrown error, so the transaction still
 * commits normally. A rebalance that accompanies a rejected move is
 * still a legitimate, harmless tidy-up of that column's ranks.
 */
export async function move(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  status: IssueStatus;
  prevIssueId?: string;
  nextIssueId?: string;
  actorId: string;
}): Promise<
  | { status: "moved"; issue: IssueRow; notifiedUserIds: string[] }
  | { status: "conflict"; current: IssueRow }
  | { status: "not_found" }
  | { status: "invalid_neighbor" }
> {
  return db.transaction(async (tx) => {
    const [currentRow] = await tx
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.organizationId, input.organizationId),
          eq(issues.projectId, input.projectId),
        ),
      );
    if (!currentRow) return { status: "not_found" };
    const fromStatus = currentRow.status;

    let newRank: string | ReturnType<typeof nextRankSql>;
    if (input.nextIssueId) {
      const bisected = await computeBisectedRank(
        tx,
        input.organizationId,
        input.projectId,
        input.status,
        input.prevIssueId ?? null,
        input.nextIssueId,
      );
      if (bisected === null) return { status: "invalid_neighbor" };
      newRank = bisected;
    } else {
      newRank = nextRankSql(input.organizationId, input.projectId, input.status);
    }

    const [updated] = await tx
      .update(issues)
      .set({
        status: input.status,
        boardRank: newRank,
        version: sql`${issues.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.organizationId, input.organizationId),
          eq(issues.projectId, input.projectId),
          eq(issues.version, input.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
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
    }

    const notifiedUserIds = await writeIssueEvent(tx, {
      issueId: updated.id,
      actorId: input.actorId,
      type: "issue.moved",
      payload: { fromStatus, toStatus: input.status },
    });

    return { status: "moved", issue: updated, notifiedUserIds };
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
}): Promise<{ status: "attached"; notifiedUserIds: string[] } | { status: "label_not_found" }> {
  return db.transaction(async (tx) => {
    const [label] = await tx
      .select()
      .from(labels)
      .where(and(eq(labels.id, input.labelId), eq(labels.organizationId, input.organizationId)));
    if (!label) return { status: "label_not_found" };

    await tx.insert(issueLabels).values({ issueId: input.issueId, labelId: input.labelId });

    const notifiedUserIds = await writeIssueEvent(tx, {
      issueId: input.issueId,
      actorId: input.actorId,
      type: "issue.label_added",
      payload: { labelId: label.id, labelName: label.name },
    });

    return { status: "attached", notifiedUserIds };
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
}): Promise<{ status: "detached"; notifiedUserIds: string[] } | { status: "label_not_found" }> {
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

    let notifiedUserIds: string[] = [];
    if (deleted.length > 0) {
      notifiedUserIds = await writeIssueEvent(tx, {
        issueId: input.issueId,
        actorId: input.actorId,
        type: "issue.label_removed",
        payload: { labelId: label.id, labelName: label.name },
      });
    }

    return { status: "detached", notifiedUserIds };
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

    const notifiedUserIds = await writeIssueEvent(tx, {
      issueId: input.issueId,
      actorId: input.authorId,
      type: "issue.commented",
      payload: { commentId: comment.id, body: comment.body },
    });

    return { comment, notifiedUserIds };
  });
}

/**
 * One comment, scoped to the issue and organization (comments has no
 * organizationId column: same join-through-issues shape as attachments and
 * events). Undefined covers "missing" and "belongs to another issue/tenant".
 */
export async function findComment(organizationId: string, issueId: string, commentId: string) {
  const [row] = await db
    .select({ comment: comments })
    .from(comments)
    .innerJoin(issues, eq(comments.issueId, issues.id))
    .where(
      and(eq(comments.id, commentId), eq(comments.issueId, issueId), eq(issues.organizationId, organizationId)),
    );
  return row?.comment;
}

/**
 * The comments row is the read model, so it is updated; the audit trail is
 * not: a new issue.comment_edited event is appended (history is never
 * patched). Quiet: no notifications.
 */
export async function updateComment(input: { issueId: string; commentId: string; actorId: string; body: string }) {
  return db.transaction(async (tx) => {
    const [comment] = await tx
      .update(comments)
      .set({ body: input.body, updatedAt: new Date() })
      .where(and(eq(comments.id, input.commentId), eq(comments.issueId, input.issueId)))
      .returning();
    if (!comment) throw new Error("Failed to update comment");

    await writeIssueEvent(
      tx,
      {
        issueId: input.issueId,
        actorId: input.actorId,
        type: "issue.comment_edited",
        payload: { commentId: comment.id, body: comment.body },
      },
      { notify: false },
    );
    return comment;
  });
}

/**
 * Removes the comments row (files attached to it survive: attachments.comment_id
 * is ON DELETE SET NULL) and appends issue.comment_deleted. The original
 * issue.commented event still holds the old text as audit history; listEvents
 * never serves it once the comment row is gone. Quiet: no notifications.
 */
export async function deleteComment(input: { issueId: string; commentId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(comments)
      .where(and(eq(comments.id, input.commentId), eq(comments.issueId, input.issueId)))
      .returning({ id: comments.id });
    if (deleted.length === 0) return false;

    await writeIssueEvent(
      tx,
      {
        issueId: input.issueId,
        actorId: input.actorId,
        type: "issue.comment_deleted",
        payload: { commentId: input.commentId },
      },
      { notify: false },
    );
    return true;
  });
}

/**
 * Joined to users for actorName (a timeline that just says a UUID
 * commented isn't readable) and to issues for organizationId scoping —
 * issue_events itself has no organizationId column, same shape as
 * listLabelsForIssue's join through labels.
 *
 * LEFT JOINed to comments for issue.commented rows, so the service can show
 * the CURRENT text (after edits) and notice a deleted comment (the joined row
 * is gone). The edit/delete audit events are not returned: they are folded
 * into the comment they belong to, not shown as timeline lines.
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
      commentRowId: comments.id,
      commentBody: comments.body,
      commentCreatedAt: comments.createdAt,
      commentUpdatedAt: comments.updatedAt,
    })
    .from(issueEvents)
    .innerJoin(users, eq(issueEvents.actorId, users.id))
    .innerJoin(issues, eq(issueEvents.issueId, issues.id))
    .leftJoin(
      comments,
      and(
        eq(issueEvents.type, "issue.commented"),
        sql`${comments.id} = (${issueEvents.payload}->>'commentId')::uuid`,
      ),
    )
    .where(
      and(
        eq(issueEvents.issueId, issueId),
        eq(issues.organizationId, organizationId),
        sql`${issueEvents.type} NOT IN ('issue.comment_edited', 'issue.comment_deleted')`,
      ),
    )
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

/**
 * sprintId: null means the backlog (sprint_id IS NULL); a real id means
 * that sprint's issues. Ordered by createdAt, not a fractional rank —
 * see the Phase 5 slice 4 plan's "Decisions": this slice deliberately
 * doesn't reuse ADR 0007's ranking machinery, since backlog/sprint
 * membership was asked for, not backlog prioritization order.
 */
export async function listByProjectAndSprint(organizationId: string, projectId: string, sprintId: string | null) {
  return db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.organizationId, organizationId),
        eq(issues.projectId, projectId),
        sprintId === null ? isNull(issues.sprintId) : eq(issues.sprintId, sprintId),
      ),
    )
    .orderBy(asc(issues.createdAt), asc(issues.id));
}

/**
 * Powers the whole backlog/active-sprint page in one query pass — same
 * "compose everything for one page in one call" precedent as
 * listForBoard. Reads the sprints table directly rather than calling
 * into sprints.repository.ts — this module already reaches into other
 * tables directly for its own composed reads (e.g. attachLabel's direct
 * `labels` select), so this follows the same convention rather than a
 * cross-module repository call.
 */
export async function getBacklog(organizationId: string, projectId: string) {
  const [activeSprint] = await db
    .select()
    .from(sprints)
    .where(
      and(eq(sprints.organizationId, organizationId), eq(sprints.projectId, projectId), eq(sprints.status, "active")),
    );

  const backlog = await listByProjectAndSprint(organizationId, projectId, null);
  const activeSprintIssues = activeSprint
    ? await listByProjectAndSprint(organizationId, projectId, activeSprint.id)
    : [];

  return { activeSprint: activeSprint ?? null, backlog, activeSprintIssues };
}

/**
 * Assigning an issue to a sprint (or back to the backlog, sprintId
 * null) is an issue mutation, not a sprint one — same shape as move():
 * conditional UPDATE on the issue's own version. sprintId is validated
 * against this project/org before the update (defense in depth against
 * a foreign/cross-tenant sprint id, same reasoning as move()'s neighbor
 * validation) rather than trusting the foreign key alone to reject it
 * with a less useful error.
 */
export async function assignSprint(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  sprintId: string | null;
  actorId: string;
}): Promise<
  | { status: "assigned"; issue: IssueRow; notifiedUserIds: string[] }
  | { status: "conflict"; current: IssueRow }
  | { status: "not_found" }
  | { status: "invalid_sprint" }
> {
  return db.transaction(async (tx) => {
    let sprintName: string | null = null;
    if (input.sprintId) {
      const [sprint] = await tx
        .select({ name: sprints.name })
        .from(sprints)
        .where(
          and(
            eq(sprints.id, input.sprintId),
            eq(sprints.organizationId, input.organizationId),
            eq(sprints.projectId, input.projectId),
          ),
        );
      if (!sprint) return { status: "invalid_sprint" };
      sprintName = sprint.name;
    }

    const [updated] = await tx
      .update(issues)
      .set({ sprintId: input.sprintId, version: sql`${issues.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.organizationId, input.organizationId),
          eq(issues.projectId, input.projectId),
          eq(issues.version, input.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
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
    }

    const notifiedUserIds = await writeIssueEvent(tx, {
      issueId: updated.id,
      actorId: input.actorId,
      type: input.sprintId ? "issue.sprint_assigned" : "issue.sprint_removed",
      payload: input.sprintId ? { sprintId: input.sprintId, sprintName } : { sprintId: null },
    });

    return { status: "assigned", issue: updated, notifiedUserIds };
  });
}

/**
 * Org-scoped, not project-scoped — a command palette (Phase 7 slice 2)
 * needs to jump across the whole org, not one project. websearch_to_
 * tsquery (not plainto_tsquery) parses the kind of syntax a real search
 * box gets typed into (quoted phrases, -exclude), not just AND-every-
 * word. No first-class Drizzle operator for tsvector @@ tsquery or
 * ts_rank, so both are raw sql — same "drop to sql when the fluent
 * builder can't express something" pattern as nextRankSql/move() above.
 * Rank itself is never returned — same ADR 0007 precedent as board_rank
 * never leaving the server: an internal ordering signal, not something
 * the client reasons about. Result count is a fixed cap, not real
 * pagination — a relevance-ranked result set degrades fast past the
 * first page, and keyset pagination for search isn't needed yet.
 */
export async function search(organizationId: string, query: string, limit: number) {
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;
  return db
    .select()
    .from(issues)
    .where(and(eq(issues.organizationId, organizationId), sql`${issues.searchVector} @@ ${tsquery}`))
    .orderBy(sql`ts_rank(${issues.searchVector}, ${tsquery}) DESC`)
    .limit(limit);
}

/**
 * Storage (the physical file write) happens in the service layer,
 * before this is ever called — this only ever writes a row for a file
 * that's already safely on disk. writeIssueEvent's notification
 * fan-out handles the uploader correctly regardless of whether they're
 * already a participant (they're always the excluded actor).
 *
 * id is supplied by the caller, not left to the column's own
 * defaultRandom() — the service layer needs a real id *before* this
 * insert runs, since lib/storage.ts's flat {attachmentId} filenames
 * mean the file has to be written to disk (and thus needs its name)
 * before the row that references it can be created. See the Phase 7
 * slice 4 plan.
 */
export async function addAttachment(input: {
  id: string;
  issueId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  /** Set when the file belongs to a comment (validated by the service first). */
  commentId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [attachment] = await tx
      .insert(attachments)
      .values({
        id: input.id,
        issueId: input.issueId,
        uploaderId: input.uploaderId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        commentId: input.commentId ?? null,
      })
      .returning();
    if (!attachment) throw new Error("Failed to create attachment");

    // Drizzle's insert().returning() can't join — a plain insert row has
    // no uploaderName, but the wire response needs one (same shape
    // listAttachmentsForIssue already returns). One cheap extra lookup,
    // still inside the transaction.
    const [uploader] = await tx.select({ name: users.name }).from(users).where(eq(users.id, input.uploaderId));
    if (!uploader) throw new Error("Failed to look up attachment uploader");

    // A comment's file is part of that comment, which already notified and is
    // already on the timeline: no separate event, no separate notification.
    const notifiedUserIds = input.commentId
      ? []
      : await writeIssueEvent(tx, {
          issueId: input.issueId,
          actorId: input.uploaderId,
          type: "issue.attachment_added",
          payload: { attachmentId: attachment.id, filename: attachment.filename },
        });

    return { attachment: { ...attachment, uploaderName: uploader.name }, notifiedUserIds };
  });
}

/**
 * Joined to users for uploaderName, through issues for organizationId
 * scoping — attachments has no organizationId column, same shape as
 * listEvents/listLabelsForIssue. downloadUrl is not computed here —
 * that's response formatting (signing a token, building a URL), the
 * controller's job, not this repository's.
 */
export async function listAttachmentsForIssue(organizationId: string, issueId: string) {
  return db
    .select({
      id: attachments.id,
      issueId: attachments.issueId,
      uploaderId: attachments.uploaderId,
      uploaderName: users.name,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
      commentId: attachments.commentId,
    })
    .from(attachments)
    .innerJoin(users, eq(attachments.uploaderId, users.id))
    .innerJoin(issues, eq(attachments.issueId, issues.id))
    .where(and(eq(attachments.issueId, issueId), eq(issues.organizationId, organizationId)))
    .orderBy(asc(attachments.createdAt));
}

/**
 * No org scoping at all — used only by the unauthenticated, token-
 * gated download route (see issues.controller.ts), where the signed
 * token itself is the sole authorization. Nothing here is reachable
 * without a valid token having already been checked first.
 */
export async function findAttachmentForDownload(attachmentId: string) {
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  return attachment;
}

/**
 * Returns the storageKey so the caller (issues.service.ts) can also
 * remove the physical file — this function only ever touches the
 * database. "not_found" covers both a genuinely missing id and one
 * belonging to a different issue/org, same as every other tenant-
 * scoped 404 in this codebase.
 */
export async function deleteAttachment(input: {
  organizationId: string;
  issueId: string;
  attachmentId: string;
  actorId: string;
}): Promise<{ status: "deleted"; storageKey: string; notifiedUserIds: string[] } | { status: "not_found" }> {
  return db.transaction(async (tx) => {
    const [attachment] = await tx
      .select({ id: attachments.id, storageKey: attachments.storageKey, filename: attachments.filename })
      .from(attachments)
      .innerJoin(issues, eq(attachments.issueId, issues.id))
      .where(
        and(
          eq(attachments.id, input.attachmentId),
          eq(attachments.issueId, input.issueId),
          eq(issues.organizationId, input.organizationId),
        ),
      );
    if (!attachment) return { status: "not_found" };

    await tx.delete(attachments).where(eq(attachments.id, attachment.id));

    const notifiedUserIds = await writeIssueEvent(tx, {
      issueId: input.issueId,
      actorId: input.actorId,
      type: "issue.attachment_removed",
      payload: { attachmentId: attachment.id, filename: attachment.filename },
    });

    return { status: "deleted", storageKey: attachment.storageKey, notifiedUserIds };
  });
}

/**
 * Hard-deletes an issue (ADR 0022). Everything under it goes by ON DELETE
 * CASCADE: events, comments, attachment rows, issue-labels and the
 * notifications that point at its events. What the cascade cannot do is delete
 * the uploaded FILES, so their storage keys are returned for the service to
 * remove after the transaction commits. Also returns who had notifications for
 * this issue (everyone who acted on it, plus the assignee) so their bells can be
 * told to refetch. Scoped by organization and project in the query itself.
 */
export async function deleteIssue(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  actorId: string;
}): Promise<{ status: "deleted"; storageKeys: string[]; affectedUserIds: string[] } | { status: "not_found" }> {
  return db.transaction(async (tx) => {
    const scope = and(
      eq(issues.id, input.issueId),
      eq(issues.organizationId, input.organizationId),
      eq(issues.projectId, input.projectId),
    );
    const [issue] = await tx
      .select({
        id: issues.id,
        assigneeId: issues.assigneeId,
        number: issues.number,
        title: issues.title,
        status: issues.status,
      })
      .from(issues)
      .where(scope);
    if (!issue) return { status: "not_found" };
    const [project] = await tx
      .select({ key: projects.key, name: projects.name })
      .from(projects)
      .where(eq(projects.id, input.projectId));

    const files = await tx
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(eq(attachments.issueId, issue.id));
    const actors = await tx
      .selectDistinct({ userId: issueEvents.actorId })
      .from(issueEvents)
      .where(eq(issueEvents.issueId, issue.id));

    // Recorded before the delete: the issue and its whole timeline are gone a statement later, so
    // the key, title and project are copied into the audit row (issue.deleted).
    await auditRepository.record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "issue.deleted",
      targetType: "issue",
      targetId: issue.id,
      targetLabel: `${project?.key ?? ""}-${issue.number} ${issue.title}`.trim(),
      details: { status: issue.status, projectName: project?.name ?? "", attachments: files.length },
    });

    await tx.delete(issues).where(scope);

    const affected = new Set(actors.map((row) => row.userId));
    if (issue.assigneeId) affected.add(issue.assigneeId);
    return {
      status: "deleted",
      storageKeys: files.map((file) => file.storageKey),
      affectedUserIds: [...affected],
    };
  });
}

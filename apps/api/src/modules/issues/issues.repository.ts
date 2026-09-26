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
  | { status: "moved"; issue: IssueRow }
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

    await tx.insert(issueEvents).values({
      issueId: updated.id,
      actorId: input.actorId,
      type: "issue.moved",
      payload: { fromStatus, toStatus: input.status },
    });

    return { status: "moved", issue: updated };
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

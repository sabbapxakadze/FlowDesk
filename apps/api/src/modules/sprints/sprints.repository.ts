import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { sprints, issues, projects } from "../../db/schema/index.js";
import * as auditRepository from "../audit/audit.repository.js";
import { writeIssueEvent } from "../issues/issues.repository.js";

type SprintRow = typeof sprints.$inferSelect;
type Tx = auditRepository.Tx;

/** The project's name at this moment, for the audit row (a sprint is read in the context of its project). */
async function projectNameOf(tx: Tx, organizationId: string, projectId: string): Promise<string> {
  const [row] = await tx
    .select({ name: projects.name })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)));
  return row?.name ?? "";
}

export async function listByProject(organizationId: string, projectId: string) {
  return db
    .select()
    .from(sprints)
    .where(and(eq(sprints.organizationId, organizationId), eq(sprints.projectId, projectId)))
    .orderBy(asc(sprints.createdAt));
}

/**
 * Scoped by organizationId + projectId + id, same defense-in-depth
 * reasoning as issues.repository.ts's findById. Used by requireSprint.
 */
export async function findById(organizationId: string, projectId: string, sprintId: string) {
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(
      and(eq(sprints.organizationId, organizationId), eq(sprints.projectId, projectId), eq(sprints.id, sprintId)),
    );
  return sprint;
}

export async function create(input: {
  organizationId: string;
  projectId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}) {
  const [sprint] = await db.insert(sprints).values(input).returning();
  if (!sprint) throw new Error("Failed to create sprint");
  return sprint;
}

/**
 * Conditional UPDATE, same shape as issues.repository.ts's update(): the
 * WHERE clause's version + status="planned" check is the atomicity, so
 * two concurrent starts (or a start racing a stale client) can't both
 * succeed. If another sprint in the project is already active, this
 * UPDATE throws a unique-violation (the partial unique index) instead of
 * returning zero rows — caught and translated to a 409 in
 * sprints.service.ts, same isUniqueViolation pattern used for duplicate
 * label names/project keys.
 */
export async function start(input: {
  organizationId: string;
  projectId: string;
  sprintId: string;
  expectedVersion: number;
  actorId: string;
}): Promise<
  { status: "started"; sprint: SprintRow } | { status: "conflict"; current: SprintRow } | { status: "not_found" }
> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(sprints)
      .set({ status: "active", version: sql`${sprints.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(sprints.id, input.sprintId),
          eq(sprints.organizationId, input.organizationId),
          eq(sprints.projectId, input.projectId),
          eq(sprints.version, input.expectedVersion),
          eq(sprints.status, "planned"),
        ),
      )
      .returning();

    if (updated) {
      await auditRepository.record(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: "sprint.started",
        targetType: "sprint",
        targetId: updated.id,
        targetLabel: updated.name,
        details: { projectName: await projectNameOf(tx, input.organizationId, input.projectId) },
      });
      return { status: "started" as const, sprint: updated };
    }

    const [current] = await tx
      .select()
      .from(sprints)
      .where(
        and(eq(sprints.id, input.sprintId), eq(sprints.organizationId, input.organizationId), eq(sprints.projectId, input.projectId)),
      );
    return current ? { status: "conflict" as const, current } : { status: "not_found" as const };
  });
}

/**
 * Rename, any status. Same conditional-UPDATE shape as start(): the version in
 * the WHERE clause is the concurrency check; the version bumps like every other
 * sprint change, so a client holding the old one gets a conflict, not a silent
 * overwrite.
 */
export async function rename(input: {
  organizationId: string;
  projectId: string;
  sprintId: string;
  expectedVersion: number;
  name: string;
  actorId: string;
}): Promise<
  { status: "renamed"; sprint: SprintRow } | { status: "conflict"; current: SprintRow } | { status: "not_found" }
> {
  const scope = and(
    eq(sprints.id, input.sprintId),
    eq(sprints.organizationId, input.organizationId),
    eq(sprints.projectId, input.projectId),
  );
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ name: sprints.name }).from(sprints).where(scope);
    const [updated] = await tx
      .update(sprints)
      .set({ name: input.name, version: sql`${sprints.version} + 1`, updatedAt: new Date() })
      .where(and(scope, eq(sprints.version, input.expectedVersion)))
      .returning();

    if (updated) {
      if (before && before.name !== updated.name) {
        await auditRepository.record(tx, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: "sprint.renamed",
          targetType: "sprint",
          targetId: updated.id,
          targetLabel: updated.name,
          details: { from: before.name, to: updated.name, projectName: await projectNameOf(tx, input.organizationId, input.projectId) },
        });
      }
      return { status: "renamed" as const, sprint: updated };
    }

    const [current] = await tx.select().from(sprints).where(scope);
    return current ? { status: "conflict" as const, current } : { status: "not_found" as const };
  });
}

/**
 * Same conditional-UPDATE shape as start(), guarded by status="active"
 * instead. On success, in the same transaction: every issue still in
 * this sprint is returned to the backlog (sprintId -> null) and gets an
 * issue.sprint_removed event with reason: "sprint_completed" — the
 * `reason` field is what lets the timeline phrase this differently from
 * a manual drag-to-backlog later without a second event type, same
 * precedent as issue.moved's payload carrying detail instead of
 * splitting into more event types. See the Phase 5 slice 4 plan.
 */
export async function complete(input: {
  organizationId: string;
  projectId: string;
  sprintId: string;
  expectedVersion: number;
  actorId: string;
}): Promise<
  | { status: "completed"; sprint: SprintRow; notifiedUserIds: string[] }
  | { status: "conflict"; current: SprintRow }
  | { status: "not_found" }
> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(sprints)
      .set({ status: "completed", version: sql`${sprints.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(sprints.id, input.sprintId),
          eq(sprints.organizationId, input.organizationId),
          eq(sprints.projectId, input.projectId),
          eq(sprints.version, input.expectedVersion),
          eq(sprints.status, "active"),
        ),
      )
      .returning();

    if (!updated) {
      const [current] = await tx
        .select()
        .from(sprints)
        .where(
          and(
            eq(sprints.id, input.sprintId),
            eq(sprints.organizationId, input.organizationId),
            eq(sprints.projectId, input.projectId),
          ),
        );
      return current ? { status: "conflict", current } : { status: "not_found" };
    }

    const released = await tx
      .update(issues)
      .set({ sprintId: null, updatedAt: new Date() })
      .where(eq(issues.sprintId, input.sprintId))
      .returning({ id: issues.id });

    // One writeIssueEvent call per released issue, not a single bulk
    // insert — each issue has its own distinct set of participants, so
    // the notification fan-out genuinely needs to run per-issue. Sprints
    // are small (a handful of issues), so this is a few extra queries
    // inside the transaction, not a real cost.
    const notifiedUserIds = new Set<string>();
    for (const issue of released) {
      const notified = await writeIssueEvent(tx, {
        issueId: issue.id,
        actorId: input.actorId,
        type: "issue.sprint_removed",
        payload: { sprintId: input.sprintId, sprintName: updated.name, reason: "sprint_completed" },
      });
      for (const userId of notified) notifiedUserIds.add(userId);
    }

    await auditRepository.record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "sprint.completed",
      targetType: "sprint",
      targetId: updated.id,
      targetLabel: updated.name,
      details: {
        releasedIssues: released.length,
        projectName: await projectNameOf(tx, input.organizationId, input.projectId),
      },
    });

    return { status: "completed", sprint: updated, notifiedUserIds: [...notifiedUserIds] };
  });
}

/**
 * Deletes a sprint that is not active. The "not active" condition is part of the
 * DELETE itself, so a sprint started between a check and the delete cannot be
 * removed. Issues pointing at it keep existing: issues.sprint_id is
 * ON DELETE SET NULL (back to the backlog). A completed sprint's issues were
 * already released when it completed.
 */
export async function remove(input: {
  organizationId: string;
  projectId: string;
  sprintId: string;
  actorId: string;
}): Promise<{ status: "deleted" } | { status: "active" } | { status: "not_found" }> {
  const scope = and(
    eq(sprints.id, input.sprintId),
    eq(sprints.organizationId, input.organizationId),
    eq(sprints.projectId, input.projectId),
  );
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ name: sprints.name, status: sprints.status }).from(sprints).where(scope);
    const deleted = await tx
      .delete(sprints)
      .where(and(scope, ne(sprints.status, "active")))
      .returning({ id: sprints.id });
    if (deleted.length > 0) {
      await auditRepository.record(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: "sprint.deleted",
        targetType: "sprint",
        targetId: input.sprintId,
        targetLabel: before?.name ?? "",
        details: {
          status: before?.status,
          projectName: await projectNameOf(tx, input.organizationId, input.projectId),
        },
      });
      return { status: "deleted" as const };
    }

    const [current] = await tx.select({ status: sprints.status }).from(sprints).where(scope);
    if (!current) return { status: "not_found" as const };
    return { status: "active" as const };
  });
}

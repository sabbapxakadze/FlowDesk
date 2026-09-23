import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issueEvents, issueLabels, issues, labels, projects } from "../../db/schema/index.js";
import type { IssueStatus } from "@flowdesk/contracts";

/**
 * Scoped by both organizationId and projectId even though projectId alone
 * would already narrow correctly — the organizationId filter is what
 * makes this safe even if a caller ever got here without requireProject
 * having verified the project belongs to that org first (ADR 0004).
 */
export async function listByProject(organizationId: string, projectId: string) {
  return db
    .select()
    .from(issues)
    .where(and(eq(issues.organizationId, organizationId), eq(issues.projectId, projectId)));
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
    const [updated] = await tx
      .update(issues)
      .set({ ...input.changes, version: sql`${issues.version} + 1`, updatedAt: new Date() })
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

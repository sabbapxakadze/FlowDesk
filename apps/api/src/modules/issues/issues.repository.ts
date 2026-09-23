import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issueEvents, issues, projects } from "../../db/schema/index.js";
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

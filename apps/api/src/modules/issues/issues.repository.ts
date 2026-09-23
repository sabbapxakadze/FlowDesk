import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issueEvents, issues, projects } from "../../db/schema/index.js";

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

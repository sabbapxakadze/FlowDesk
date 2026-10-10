import { and, count, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issues, projects } from "../../db/schema/index.js";

/**
 * The open issues assigned to one person across the projects of one organization, most recently changed first, plus
 * how many there are in all. Scoped through the PROJECT's organization (issues carry only a project id), so another
 * organization's issues can never match even for a person who belongs to both.
 */
export async function listAssignedTo(organizationId: string, userId: string, limit: number) {
  const where = and(eq(projects.organizationId, organizationId), eq(issues.assigneeId, userId), ne(issues.status, "done"));
  const [items, totals] = await Promise.all([
    db
      .select({
        id: issues.id,
        number: issues.number,
        title: issues.title,
        status: issues.status,
        priority: issues.priority,
        dueDate: issues.dueDate,
        projectId: issues.projectId,
        projectKey: projects.key,
        projectName: projects.name,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(where)
      .orderBy(desc(issues.updatedAt), desc(issues.id))
      .limit(limit),
    db.select({ total: count() }).from(issues).innerJoin(projects, eq(projects.id, issues.projectId)).where(where),
  ]);
  return { items, total: totals[0]?.total ?? 0 };
}

/**
 * Of my issues due from `from` to `to` (calendar days, both included): how many are done, and how many in all. Same
 * tenant scoping as the list (through the project's organization). Issues with no due date never match the range.
 */
export async function weekProgress(organizationId: string, userId: string, from: string, to: string) {
  const [row] = await db
    .select({
      total: count(),
      done: sql<number>`count(*) filter (where ${issues.status} = 'done')`.mapWith(Number),
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(and(eq(projects.organizationId, organizationId), eq(issues.assigneeId, userId), gte(issues.dueDate, from), lte(issues.dueDate, to)));
  return { done: row?.done ?? 0, total: row?.total ?? 0 };
}

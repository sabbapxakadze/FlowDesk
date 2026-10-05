import { and, count, desc, eq, ne } from "drizzle-orm";
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

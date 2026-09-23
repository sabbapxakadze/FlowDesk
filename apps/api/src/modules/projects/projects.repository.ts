import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { projects } from "../../db/schema/index.js";

/**
 * Drizzle queries only — no business logic here (see CLAUDE.md's layering
 * convention). Every function that reads tenant data takes organizationId
 * and filters on it in the query itself; that is not optional, even though
 * there is only one caller today (see ADR 0004 — defense in depth means
 * this stays true even before auth exists to enforce it a second way).
 */
export async function listByOrganization(organizationId: string) {
  return db.select().from(projects).where(eq(projects.organizationId, organizationId));
}

export async function create(input: { organizationId: string; name: string; key: string }) {
  const [project] = await db.insert(projects).values(input).returning();
  if (!project) throw new Error("Failed to create project");
  return project;
}

/**
 * Scoped by organizationId even though a project's id alone would already
 * find the right row — same defense-in-depth reasoning as every other
 * tenant-scoped query (ADR 0004). Used by requireProject to confirm a
 * :projectId route param actually belongs to the caller's organization.
 */
export async function findById(organizationId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)));
  return project;
}

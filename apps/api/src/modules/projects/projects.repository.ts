import { eq } from "drizzle-orm";
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

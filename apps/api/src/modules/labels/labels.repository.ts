import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { labels } from "../../db/schema/index.js";

export async function listByOrganization(organizationId: string) {
  return db.select().from(labels).where(eq(labels.organizationId, organizationId));
}

export async function create(input: { organizationId: string; name: string; color: string }) {
  const [label] = await db.insert(labels).values(input).returning();
  if (!label) throw new Error("Failed to create label");
  return label;
}

/**
 * Scoped by organization, so another organization's label id finds nothing
 * (undefined) instead of being renamed. A name that collides with another label
 * in the organization throws a unique violation (translated in the service).
 */
export async function update(
  organizationId: string,
  labelId: string,
  changes: { name?: string; color?: string },
) {
  const [label] = await db
    .update(labels)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(labels.organizationId, organizationId), eq(labels.id, labelId)))
    .returning();
  return label;
}

import { eq } from "drizzle-orm";
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

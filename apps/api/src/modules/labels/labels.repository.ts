import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issueLabels, labels } from "../../db/schema/index.js";
import * as auditRepository from "../audit/audit.repository.js";

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
  actorId: string,
) {
  return db.transaction(async (tx) => {
    const scope = and(eq(labels.organizationId, organizationId), eq(labels.id, labelId));
    const [before] = await tx.select().from(labels).where(scope);
    if (!before) return undefined;
    const [label] = await tx
      .update(labels)
      .set({ ...changes, updatedAt: new Date() })
      .where(scope)
      .returning();
    if (label) {
      // Only the fields that really changed, each with its old and new value (label.updated).
      const details: Record<string, { from: string; to: string }> = {};
      if (changes.name !== undefined && changes.name !== before.name) details.name = { from: before.name, to: changes.name };
      if (changes.color !== undefined && changes.color !== before.color) details.color = { from: before.color, to: changes.color };
      if (Object.keys(details).length > 0) {
        await auditRepository.record(tx, {
          organizationId,
          actorId,
          action: "label.updated",
          targetType: "label",
          targetId: labelId,
          targetLabel: label.name,
          details,
        });
      }
    }
    return label;
  });
}

/**
 * Scoped by organization. Removing the label cascades to issue_labels, so it
 * disappears from every issue that used it; past activity keeps the name it had
 * (events hold a snapshot). False = no such label in this organization.
 */
export async function remove(organizationId: string, labelId: string, actorId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const scope = and(eq(labels.organizationId, organizationId), eq(labels.id, labelId));
    const [label] = await tx.select().from(labels).where(scope);
    if (!label) return false;
    // Recorded before the delete, with how many issues carried it at this moment.
    const [{ usedOnIssues } = { usedOnIssues: 0 }] = await tx
      .select({ usedOnIssues: sql<number>`count(*)::int` })
      .from(issueLabels)
      .where(eq(issueLabels.labelId, labelId));
    await auditRepository.record(tx, {
      organizationId,
      actorId,
      action: "label.deleted",
      targetType: "label",
      targetId: labelId,
      targetLabel: label.name,
      details: { color: label.color, usedOnIssues },
    });
    const deleted = await tx.delete(labels).where(scope).returning({ id: labels.id });
    return deleted.length > 0;
  });
}

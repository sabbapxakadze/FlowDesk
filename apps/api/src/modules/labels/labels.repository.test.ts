import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { organizations } from "../../db/schema/index.js";
import * as labelsRepository from "./labels.repository.js";
import * as labelsService from "./labels.service.js";
import { AppError } from "../../shared/errors.js";

/**
 * Runs against a real Postgres database, same as projects.repository.test.ts.
 */
describe("labels repository", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("only returns labels belonging to the requested organization", async () => {
    const [orgA] = await db.insert(organizations).values({ name: "Org A", slug: "org-a" }).returning();
    const [orgB] = await db.insert(organizations).values({ name: "Org B", slug: "org-b" }).returning();
    if (!orgA || !orgB) throw new Error("setup failed");

    await labelsRepository.create({ organizationId: orgA.id, name: "bug", color: "#FF0000" });
    await labelsRepository.create({ organizationId: orgB.id, name: "bug", color: "#00FF00" });

    const result = await labelsRepository.listByOrganization(orgA.id);

    expect(result).toHaveLength(1);
    expect(result[0]?.organizationId).toBe(orgA.id);
    expect(result[0]?.color).toBe("#FF0000");
  });

  it("rejects a duplicate label name within the same organization with a 409", async () => {
    const [org] = await db.insert(organizations).values({ name: "Org", slug: "org" }).returning();
    if (!org) throw new Error("setup failed");

    await labelsService.createLabel({ organizationId: org.id, name: "bug", color: "#FF0000" });

    await expect(
      labelsService.createLabel({ organizationId: org.id, name: "bug", color: "#00FF00" }),
    ).rejects.toMatchObject({ status: 409, code: "label_name_taken" } satisfies Partial<AppError>);
  });

  it("allows the same label name in two different organizations", async () => {
    const [orgA] = await db.insert(organizations).values({ name: "Org A", slug: "org-a" }).returning();
    const [orgB] = await db.insert(organizations).values({ name: "Org B", slug: "org-b" }).returning();
    if (!orgA || !orgB) throw new Error("setup failed");

    await labelsService.createLabel({ organizationId: orgA.id, name: "bug", color: "#FF0000" });

    await expect(
      labelsService.createLabel({ organizationId: orgB.id, name: "bug", color: "#00FF00" }),
    ).resolves.toMatchObject({ name: "bug" });
  });
});

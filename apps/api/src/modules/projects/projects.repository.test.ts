import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { organizations, projects } from "../../db/schema/index.js";
import * as projectsRepository from "./projects.repository.js";

/**
 * Runs against a real Postgres database (flowdesk_test — see
 * db/test-setup.ts), not a mock. The thing worth proving here isn't "does
 * a SELECT work" — it's the same question ADR 0004 promises a real test
 * suite will answer once auth exists: can one organization ever see
 * another's data through this query. See CLAUDE.md's tenant-isolation rule.
 */
describe("projects repository", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("only returns projects belonging to the requested organization", async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: "Org A", slug: "org-a" })
      .returning();
    const [orgB] = await db
      .insert(organizations)
      .values({ name: "Org B", slug: "org-b" })
      .returning();
    if (!orgA || !orgB) throw new Error("setup failed");

    await db.insert(projects).values([
      { organizationId: orgA.id, name: "A Web", key: "WEB" },
      { organizationId: orgA.id, name: "A API", key: "API" },
      { organizationId: orgB.id, name: "B Web", key: "WEB" },
    ]);

    const result = await projectsRepository.listByOrganization(orgA.id);

    expect(result).toHaveLength(2);
    expect(result.every((p) => p.organizationId === orgA.id)).toBe(true);
    expect(result.map((p) => p.key).sort()).toEqual(["API", "WEB"]);
  });

  it("returns an empty list for an organization with no projects", async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Empty Org", slug: "empty-org" })
      .returning();
    if (!org) throw new Error("setup failed");

    const result = await projectsRepository.listByOrganization(org.id);

    expect(result).toEqual([]);
  });
});

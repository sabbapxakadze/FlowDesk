import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { organizations, projects } from "../../db/schema/index.js";
import * as projectsRepository from "./projects.repository.js";
import * as projectsService from "./projects.service.js";

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

/**
 * Was previously untested: the 409-on-duplicate-key path relied on
 * isUniqueViolation() reading err.code/err.constraint off the top-level
 * error, but this drizzle-orm version wraps the real pg error under
 * err.cause — the check never actually matched, so a duplicate project
 * key silently fell through to a raw 500. Found and fixed while building
 * Phase 3 slice 3's identical label-uniqueness check.
 */
describe("projects service — duplicate key", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a duplicate project key within the same organization with a 409", async () => {
    const [org] = await db.insert(organizations).values({ name: "Org", slug: "org" }).returning();
    if (!org) throw new Error("setup failed");

    await projectsService.createProject({ organizationId: org.id, name: "Website", key: "WEB" });

    await expect(
      projectsService.createProject({ organizationId: org.id, name: "Other", key: "WEB" }),
    ).rejects.toMatchObject({ status: 409, code: "project_key_taken" });
  });

  it("allows the same project key in two different organizations", async () => {
    const [orgA] = await db.insert(organizations).values({ name: "Org A", slug: "org-a" }).returning();
    const [orgB] = await db.insert(organizations).values({ name: "Org B", slug: "org-b" }).returning();
    if (!orgA || !orgB) throw new Error("setup failed");

    await projectsService.createProject({ organizationId: orgA.id, name: "Website", key: "WEB" });

    await expect(
      projectsService.createProject({ organizationId: orgB.id, name: "Website", key: "WEB" }),
    ).resolves.toMatchObject({ key: "WEB" });
  });
});

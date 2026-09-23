import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, organizations, projects, users } from "../../db/schema/index.js";
import * as issuesRepository from "./issues.repository.js";

async function seedOrgProjectUser(orgName: string, orgSlug: string, projectKey: string) {
  const [org] = await db.insert(organizations).values({ name: orgName, slug: orgSlug }).returning();
  if (!org) throw new Error("setup failed");

  const [project] = await db
    .insert(projects)
    .values({ organizationId: org.id, name: `${orgName} Project`, key: projectKey })
    .returning();
  if (!project) throw new Error("setup failed");

  const [user] = await db
    .insert(users)
    .values({ email: `${orgSlug}@example.com`, passwordHash: "not-a-real-hash", name: "Test User" })
    .returning();
  if (!user) throw new Error("setup failed");

  return { org, project, user };
}

/**
 * Runs against a real Postgres database, same as projects.repository.test.ts.
 * The concurrency test is the important one here — see the Phase 3 slice 1
 * plan's "Decisions" section: the atomic UPDATE...RETURNING counter is only
 * actually safe if Postgres's row lock genuinely prevents two concurrent
 * creates from getting the same number, and that's not provable by reading
 * the code, only by actually racing it.
 */
describe("issues repository", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("only returns issues belonging to the requested project", async () => {
    const a = await seedOrgProjectUser("Org A", "org-a", "AAA");
    const b = await seedOrgProjectUser("Org B", "org-b", "BBB");

    await issuesRepository.create({
      organizationId: a.org.id,
      projectId: a.project.id,
      title: "A issue",
      description: null,
      reporterId: a.user.id,
    });
    await issuesRepository.create({
      organizationId: b.org.id,
      projectId: b.project.id,
      title: "B issue",
      description: null,
      reporterId: b.user.id,
    });

    const result = await issuesRepository.listByProject(a.org.id, a.project.id);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("A issue");
  });

  it("assigns sequential numbers starting at 1", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");

    const first = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "First",
      description: null,
      reporterId: user.id,
    });
    const second = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Second",
      description: null,
      reporterId: user.id,
    });

    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
  });

  it("assigns distinct numbers even when issues are created concurrently", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");

    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        issuesRepository.create({
          organizationId: org.id,
          projectId: project.id,
          title: `Issue ${i}`,
          description: null,
          reporterId: user.id,
        }),
      ),
    );

    const numbers = created.map((issue) => issue.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("writes exactly one issue.created event in the same transaction as the insert", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");

    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Traced issue",
      description: null,
      reporterId: user.id,
    });

    const events = await db.select().from(issueEvents).where(eq(issueEvents.issueId, issue.id));

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("issue.created");
    expect(events[0]?.actorId).toBe(user.id);
  });
});

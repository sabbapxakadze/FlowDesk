import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, organizations, projects, users } from "../../db/schema/index.js";
import * as sprintsRepository from "./sprints.repository.js";
import * as sprintsService from "./sprints.service.js";
import * as issuesRepository from "../issues/issues.repository.js";

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
 * Runs against a real Postgres database, same as issues.repository.test.ts.
 * The at-most-one-active-sprint constraint and the concurrent-start race
 * are the important tests here — see the Phase 5 slice 4 plan's
 * "Decisions": the database is meant to be the actual source of truth for
 * that invariant, not just application code, and that's only provable by
 * actually racing it, not by reading the query.
 */
describe("sprints repository", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates a sprint as planned by default", async () => {
    const { org, project } = await seedOrgProjectUser("Org", "org", "PRJ");

    const sprint = await sprintsRepository.create({
      organizationId: org.id,
      projectId: project.id,
      name: "Sprint 1",
      startDate: null,
      endDate: null,
    });

    expect(sprint.status).toBe("planned");
    expect(sprint.version).toBe(1);
  });

  it("only lists sprints belonging to the requested project", async () => {
    const a = await seedOrgProjectUser("Org A", "org-a", "AAA");
    const b = await seedOrgProjectUser("Org B", "org-b", "BBB");
    await sprintsRepository.create({ organizationId: a.org.id, projectId: a.project.id, name: "A Sprint", startDate: null, endDate: null });
    await sprintsRepository.create({ organizationId: b.org.id, projectId: b.project.id, name: "B Sprint", startDate: null, endDate: null });

    const result = await sprintsRepository.listByProject(a.org.id, a.project.id);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("A Sprint");
  });

  it("starts a planned sprint and bumps its version", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const sprint = await sprintsRepository.create({ organizationId: org.id, projectId: project.id, name: "Sprint 1", startDate: null, endDate: null });

    const result = await sprintsRepository.start({
      organizationId: org.id,
      projectId: project.id,
      sprintId: sprint.id,
      expectedVersion: sprint.version,
      actorId: user.id,
    });

    if (result.status !== "started") throw new Error("expected started");
    expect(result.sprint.status).toBe("active");
    expect(result.sprint.version).toBe(sprint.version + 1);
  });

  it("rejects starting a second sprint while one is already active", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const first = await sprintsRepository.create({ organizationId: org.id, projectId: project.id, name: "Sprint 1", startDate: null, endDate: null });
    const second = await sprintsRepository.create({ organizationId: org.id, projectId: project.id, name: "Sprint 2", startDate: null, endDate: null });

    await sprintsService.startSprint({ organizationId: org.id, projectId: project.id, sprintId: first.id, expectedVersion: first.version, actorId: user.id });

    await expect(
      sprintsService.startSprint({ organizationId: org.id, projectId: project.id, sprintId: second.id, expectedVersion: second.version, actorId: user.id }),
    ).rejects.toMatchObject({ status: 409, code: "sprint_already_active" });
  });

  it("lets exactly one of two concurrent starts on different sprints succeed", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const first = await sprintsRepository.create({ organizationId: org.id, projectId: project.id, name: "Sprint 1", startDate: null, endDate: null });
    const second = await sprintsRepository.create({ organizationId: org.id, projectId: project.id, name: "Sprint 2", startDate: null, endDate: null });

    const results = await Promise.allSettled([
      sprintsService.startSprint({ organizationId: org.id, projectId: project.id, sprintId: first.id, expectedVersion: first.version, actorId: user.id }),
      sprintsService.startSprint({ organizationId: org.id, projectId: project.id, sprintId: second.id, expectedVersion: second.version, actorId: user.id }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const active = await sprintsRepository.listByProject(org.id, project.id);
    expect(active.filter((s) => s.status === "active")).toHaveLength(1);
  });

  it("returns a conflict without starting the row when the version is stale", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const sprint = await sprintsRepository.create({ organizationId: org.id, projectId: project.id, name: "Sprint 1", startDate: null, endDate: null });

    const result = await sprintsRepository.start({
      organizationId: org.id,
      projectId: project.id,
      sprintId: sprint.id,
      expectedVersion: sprint.version + 5,
      actorId: user.id,
    });

    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") throw new Error("expected conflict");
    expect(result.current.status).toBe("planned");
  });

  it("completes an active sprint, returns its issues to the backlog, and writes a sprint_completed event per issue", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const sprint = await sprintsRepository.create({ organizationId: org.id, projectId: project.id, name: "Sprint 1", startDate: null, endDate: null });
    await sprintsRepository.start({ organizationId: org.id, projectId: project.id, sprintId: sprint.id, expectedVersion: sprint.version, actorId: user.id });

    const issueA = await issuesRepository.create({ organizationId: org.id, projectId: project.id, title: "A", description: null, reporterId: user.id });
    const issueB = await issuesRepository.create({ organizationId: org.id, projectId: project.id, title: "B", description: null, reporterId: user.id });
    await issuesRepository.assignSprint({ organizationId: org.id, projectId: project.id, issueId: issueA.id, expectedVersion: issueA.version, sprintId: sprint.id, actorId: user.id });
    await issuesRepository.assignSprint({ organizationId: org.id, projectId: project.id, issueId: issueB.id, expectedVersion: issueB.version, sprintId: sprint.id, actorId: user.id });

    const result = await sprintsRepository.complete({
      organizationId: org.id,
      projectId: project.id,
      sprintId: sprint.id,
      expectedVersion: sprint.version + 1,
      actorId: user.id,
    });

    if (result.status !== "completed") throw new Error("expected completed");
    expect(result.sprint.status).toBe("completed");

    const backlog = await issuesRepository.listByProjectAndSprint(org.id, project.id, null);
    expect(backlog.map((i) => i.id).sort()).toEqual([issueA.id, issueB.id].sort());

    const events = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issueA.id), eq(issueEvents.type, "issue.sprint_removed")));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ sprintId: sprint.id, sprintName: "Sprint 1", reason: "sprint_completed" });
  });

  it("returns a conflict without completing the row when the version is stale", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const sprint = await sprintsRepository.create({ organizationId: org.id, projectId: project.id, name: "Sprint 1", startDate: null, endDate: null });
    await sprintsRepository.start({ organizationId: org.id, projectId: project.id, sprintId: sprint.id, expectedVersion: sprint.version, actorId: user.id });

    const result = await sprintsRepository.complete({
      organizationId: org.id,
      projectId: project.id,
      sprintId: sprint.id,
      expectedVersion: sprint.version + 5,
      actorId: user.id,
    });

    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") throw new Error("expected conflict");
    expect(result.current.status).toBe("active");
  });
});

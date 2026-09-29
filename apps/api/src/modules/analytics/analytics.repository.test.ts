import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, organizations, projects, users } from "../../db/schema/index.js";
import * as issuesRepository from "../issues/issues.repository.js";
import * as analyticsRepository from "./analytics.repository.js";

// Wednesday 2026-03-18 -> current UTC week starts Monday 2026-03-16.
const NOW = new Date("2026-03-18T12:00:00Z");
const WEEKS = 4; // week starts: 02-23, 03-02, 03-09, 03-16

async function seed(orgSlug: string, projectKey: string) {
  const [org] = await db.insert(organizations).values({ name: orgSlug, slug: orgSlug }).returning();
  const [project] = await db
    .insert(projects)
    .values({ organizationId: org!.id, name: `${orgSlug} project`, key: projectKey })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: `${orgSlug}@example.com`, passwordHash: "x", name: "U" })
    .returning();
  return { org: org!, project: project!, user: user! };
}

async function makeIssue(s: Awaited<ReturnType<typeof seed>>) {
  return issuesRepository.create({
    organizationId: s.org.id,
    projectId: s.project.id,
    title: "Issue",
    description: null,
    reporterId: s.user.id,
  });
}

// Backdated on purpose: the query reads created_at, and the real
// repository functions always stamp "now".
async function event(issueId: string, actorId: string, type: string, payload: object, at: string) {
  await db.insert(issueEvents).values({ issueId, actorId, type, payload, createdAt: new Date(at) });
}

const moved = (from: string, to: string) => ({ fromStatus: from, toStatus: to });

function byWeek(rows: Array<{ weekStart: string; completed: number }>) {
  return Object.fromEntries(rows.map((r) => [r.weekStart, r.completed]));
}

describe("analytics repository — throughput", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("counts a move into done in the week it happened, zero-filling the rest in order", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "done"), "2026-03-10T10:00:00Z");

    const rows = await analyticsRepository.throughputByWeek(s.org.id, s.project.id, WEEKS, NOW);

    expect(rows.map((r) => r.weekStart)).toEqual(["2026-02-23", "2026-03-02", "2026-03-09", "2026-03-16"]);
    expect(rows.map((r) => r.completed)).toEqual([0, 0, 1, 0]);
  });

  it("counts a status change made through issue.updated (the edit form path)", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.updated", { status: "done" }, "2026-03-04T10:00:00Z");

    const rows = await analyticsRepository.throughputByWeek(s.org.id, s.project.id, WEEKS, NOW);

    expect(byWeek(rows)["2026-03-02"]).toBe(1);
  });

  it("does not count an issue.updated that resends status: done when it was already done", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "done"), "2026-03-10T10:00:00Z");
    // The trap: editing the title later resends the unchanged status.
    await event(issue.id, s.user.id, "issue.updated", { title: "Renamed", status: "done" }, "2026-03-17T10:00:00Z");

    const rows = await analyticsRepository.throughputByWeek(s.org.id, s.project.id, WEEKS, NOW);

    expect(rows.map((r) => r.completed)).toEqual([0, 0, 1, 0]);
  });

  it("counts a reopened-then-finished-again issue twice (completions, not distinct issues)", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "done"), "2026-03-03T10:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("done", "in_progress"), "2026-03-05T10:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("in_progress", "done"), "2026-03-11T10:00:00Z");

    const rows = await analyticsRepository.throughputByWeek(s.org.id, s.project.id, WEEKS, NOW);

    expect(rows.map((r) => r.completed)).toEqual([0, 1, 1, 0]);
  });

  it("does not count a same-column reorder of a done issue", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "done"), "2026-03-10T10:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("done", "done"), "2026-03-17T10:00:00Z");

    const rows = await analyticsRepository.throughputByWeek(s.org.id, s.project.id, WEEKS, NOW);

    expect(rows.map((r) => r.completed)).toEqual([0, 0, 1, 0]);
  });

  it("ignores completions outside the window", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "done"), "2025-12-01T10:00:00Z");

    const rows = await analyticsRepository.throughputByWeek(s.org.id, s.project.id, WEEKS, NOW);

    expect(rows.every((r) => r.completed === 0)).toBe(true);
  });

  it("never counts another project's or another organization's completions", async () => {
    const a = await seed("org-a", "AAA");
    const [otherProject] = await db
      .insert(projects)
      .values({ organizationId: a.org.id, name: "Other", key: "OTH" })
      .returning();
    const b = await seed("org-b", "BBB");

    const inA = await makeIssue(a);
    const inOtherProject = await issuesRepository.create({
      organizationId: a.org.id,
      projectId: otherProject!.id,
      title: "Elsewhere",
      description: null,
      reporterId: a.user.id,
    });
    const inB = await makeIssue(b);
    for (const issue of [inA, inOtherProject, inB]) {
      await event(issue.id, a.user.id, "issue.moved", moved("todo", "done"), "2026-03-10T10:00:00Z");
    }

    const rows = await analyticsRepository.throughputByWeek(a.org.id, a.project.id, WEEKS, NOW);

    expect(rows.map((r) => r.completed)).toEqual([0, 0, 1, 0]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, issues, organizations, projects, sprints, users } from "../../db/schema/index.js";
import * as issuesRepository from "../issues/issues.repository.js";
import * as sprintsRepository from "../sprints/sprints.repository.js";
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

type Seeded = Awaited<ReturnType<typeof seed>>;
const DAY_MS = 86_400_000;

// A finished issue whose start and finish are placed exactly, via issue.moved.
async function finishedIssue(s: Seeded, startedAt: string, doneAt: string) {
  const issue = await makeIssue(s);
  await event(issue.id, s.user.id, "issue.moved", moved("todo", "in_progress"), startedAt);
  await event(issue.id, s.user.id, "issue.moved", moved("in_progress", "done"), doneAt);
  return issue;
}

const daysBefore = (iso: string, days: number) => new Date(new Date(iso).getTime() - days * DAY_MS).toISOString();

describe("analytics repository — cycle time", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("measures first in_progress to done in days", async () => {
    const s = await seed("org", "PRJ");
    await finishedIssue(s, "2026-03-03T10:00:00Z", "2026-03-06T10:00:00Z");

    const result = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(result.summary).toEqual({
      completed: 1,
      withoutStart: 0,
      averageDays: 3,
      medianDays: 3,
      p90Days: 3,
    });
  });

  it("excludes an issue that finished without ever being in progress, and counts it as withoutStart", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "done"), "2026-03-10T10:00:00Z");

    const result = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(result.summary).toEqual({
      completed: 0,
      withoutStart: 1,
      averageDays: null,
      medianDays: null,
      p90Days: null,
    });
  });

  it("starts the clock at the FIRST entry into in_progress, not a later re-entry", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "in_progress"), "2026-03-02T00:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("in_progress", "todo"), "2026-03-03T00:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "in_progress"), "2026-03-08T00:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("in_progress", "done"), "2026-03-10T00:00:00Z");

    const result = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(result.summary.medianDays).toBe(8); // 03-02 -> 03-10, not 03-08 -> 03-10
  });

  it("counts a reopened-and-finished-again issue once, from its first completion", async () => {
    const s = await seed("org", "PRJ");
    const issue = await finishedIssue(s, "2026-03-02T00:00:00Z", "2026-03-04T00:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("done", "in_progress"), "2026-03-06T00:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("in_progress", "done"), "2026-03-12T00:00:00Z");

    const result = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(result.summary.completed).toBe(1);
    expect(result.summary.medianDays).toBe(2);
  });

  it("uses the first completion AFTER the start when the issue was once finished without starting", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.moved", moved("todo", "done"), "2026-03-01T00:00:00Z"); // skipped in-progress
    await event(issue.id, s.user.id, "issue.moved", moved("done", "in_progress"), "2026-03-05T00:00:00Z");
    await event(issue.id, s.user.id, "issue.moved", moved("in_progress", "done"), "2026-03-09T00:00:00Z");

    const result = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(result.summary.completed).toBe(1);
    expect(result.summary.withoutStart).toBe(0);
    expect(result.summary.medianDays).toBe(4); // 03-05 -> 03-09, never a negative span
  });

  it("reads starts and finishes made through issue.updated (the edit form path)", async () => {
    const s = await seed("org", "PRJ");
    const issue = await makeIssue(s);
    await event(issue.id, s.user.id, "issue.updated", { status: "in_progress" }, "2026-03-02T00:00:00Z");
    await event(issue.id, s.user.id, "issue.updated", { status: "done" }, "2026-03-05T00:00:00Z");

    const result = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(result.summary.medianDays).toBe(3);
  });

  it("puts each value in the right bucket (inclusive lower bound) and always returns all six", async () => {
    const s = await seed("org", "PRJ");
    const doneAt = "2026-03-15T12:00:00Z";
    for (const days of [0.5, 1, 5, 10, 20, 40]) {
      await finishedIssue(s, daysBefore(doneAt, days), doneAt);
    }

    const result = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(result.distribution).toEqual([
      { label: "< 1 day", count: 1 },
      { label: "1-3 days", count: 1 }, // exactly 1.0 day lands here, not in "< 1 day"
      { label: "3-7 days", count: 1 },
      { label: "1-2 weeks", count: 1 },
      { label: "2-4 weeks", count: 1 },
      { label: "4+ weeks", count: 1 },
    ]);
  });

  it("computes mean, median and p90 from the unrounded values", async () => {
    const s = await seed("org", "PRJ");
    const doneAt = "2026-03-15T12:00:00Z";
    for (const days of [0.5, 1, 5, 10, 20, 40]) {
      await finishedIssue(s, daysBefore(doneAt, days), doneAt);
    }

    const { summary } = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(summary.completed).toBe(6);
    expect(summary.averageDays).toBe(12.8); // 76.5 / 6 = 12.75, rounded once at the end
    expect(summary.medianDays).toBe(7.5); // (5 + 10) / 2
    expect(summary.p90Days).toBe(30); // halfway between 20 and 40
  });

  it("returns nulls (not 0 or NaN) and six empty buckets when nothing finished", async () => {
    const s = await seed("org", "PRJ");

    const result = await analyticsRepository.cycleTime(s.org.id, s.project.id, WEEKS, NOW);

    expect(result.summary).toEqual({
      completed: 0,
      withoutStart: 0,
      averageDays: null,
      medianDays: null,
      p90Days: null,
    });
    expect(result.distribution).toHaveLength(6);
    expect(result.distribution.every((b) => b.count === 0)).toBe(true);
  });

  it("ignores finishes outside the window and other projects' or organizations' issues", async () => {
    const a = await seed("org-a", "AAA");
    const [otherProject] = await db
      .insert(projects)
      .values({ organizationId: a.org.id, name: "Other", key: "OTH" })
      .returning();
    const b = await seed("org-b", "BBB");

    await finishedIssue(a, "2026-03-03T10:00:00Z", "2026-03-06T10:00:00Z"); // counts
    await finishedIssue(a, "2025-11-01T10:00:00Z", "2025-11-05T10:00:00Z"); // before the window
    await finishedIssue(b, "2026-03-03T10:00:00Z", "2026-03-06T10:00:00Z"); // other org
    const elsewhere = await issuesRepository.create({
      organizationId: a.org.id,
      projectId: otherProject!.id,
      title: "Elsewhere",
      description: null,
      reporterId: a.user.id,
    });
    await event(elsewhere.id, a.user.id, "issue.moved", moved("todo", "in_progress"), "2026-03-03T10:00:00Z");
    await event(elsewhere.id, a.user.id, "issue.moved", moved("in_progress", "done"), "2026-03-06T10:00:00Z");

    const result = await analyticsRepository.cycleTime(a.org.id, a.project.id, WEEKS, NOW);

    expect(result.summary.completed).toBe(1);
  });
});

// Velocity tests drive the REAL sprint and issue repositories rather than
// hand-placing events: the whole point of ADR 0011 is that complete()'s own
// release events are the source of truth, so the tests must produce them the
// way production does.
async function versionOf(issueId: string) {
  const [row] = await db.select({ version: issues.version }).from(issues).where(eq(issues.id, issueId));
  return row!.version;
}

async function sprintVersionOf(sprintId: string) {
  const [row] = await db.select({ version: sprints.version }).from(sprints).where(eq(sprints.id, sprintId));
  return row!.version;
}

async function startedSprint(s: Seeded, name: string) {
  const sprint = await sprintsRepository.create({
    organizationId: s.org.id,
    projectId: s.project.id,
    name,
    startDate: null,
    endDate: null,
  });
  await sprintsRepository.start({
    organizationId: s.org.id,
    projectId: s.project.id,
    sprintId: sprint.id,
    expectedVersion: sprint.version,
  });
  return sprint;
}

async function addToSprint(s: Seeded, issueId: string, sprintId: string | null) {
  await issuesRepository.assignSprint({
    organizationId: s.org.id,
    projectId: s.project.id,
    issueId,
    expectedVersion: await versionOf(issueId),
    sprintId,
    actorId: s.user.id,
  });
}

async function setStatus(s: Seeded, issueId: string, status: "todo" | "in_progress" | "done") {
  await issuesRepository.move({
    organizationId: s.org.id,
    projectId: s.project.id,
    issueId,
    expectedVersion: await versionOf(issueId),
    status,
    actorId: s.user.id,
  });
}

async function closeSprint(s: Seeded, sprintId: string) {
  await sprintsRepository.complete({
    organizationId: s.org.id,
    projectId: s.project.id,
    sprintId,
    expectedVersion: await sprintVersionOf(sprintId),
    actorId: s.user.id,
  });
}

describe("analytics repository — sprint velocity", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("counts issues in the sprint at close as committed and those done at close as completed", async () => {
    const s = await seed("org", "PRJ");
    const sprint = await startedSprint(s, "Sprint 1");
    const [a, b, c] = [await makeIssue(s), await makeIssue(s), await makeIssue(s)];
    for (const issue of [a, b, c]) await addToSprint(s, issue.id, sprint.id);
    await setStatus(s, a.id, "done");
    await setStatus(s, b.id, "done");
    await setStatus(s, c.id, "in_progress");
    await closeSprint(s, sprint.id);

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 8);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sprintId: sprint.id, name: "Sprint 1", committed: 3, completed: 2 });
  });

  // Two separate tests on purpose: in one combined test the two mistakes
  // (crediting a late finish, dropping a reopened one) cancel out to the same
  // total, so a query that used the status "now" would still pass.
  it("does not credit a sprint for an issue that was only finished after it closed", async () => {
    const s = await seed("org", "PRJ");
    const sprint = await startedSprint(s, "Sprint 1");
    const late = await makeIssue(s);
    await addToSprint(s, late.id, sprint.id);
    await setStatus(s, late.id, "in_progress");
    await closeSprint(s, sprint.id);

    await setStatus(s, late.id, "done"); // finished after the close

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 8);

    expect(rows[0]).toMatchObject({ committed: 1, completed: 0 });
  });

  it("keeps the credit for an issue that was done at close and reopened afterwards", async () => {
    const s = await seed("org", "PRJ");
    const sprint = await startedSprint(s, "Sprint 1");
    const reopened = await makeIssue(s);
    await addToSprint(s, reopened.id, sprint.id);
    await setStatus(s, reopened.id, "done");
    await closeSprint(s, sprint.id);

    await setStatus(s, reopened.id, "in_progress"); // reopened after the close

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 8);

    expect(rows[0]).toMatchObject({ committed: 1, completed: 1 });
  });

  it("does not count a manual removal even if it names the sprint (only the close-time release counts)", async () => {
    const s = await seed("org", "PRJ");
    const sprint = await startedSprint(s, "Sprint 1");
    const issue = await makeIssue(s);
    await addToSprint(s, issue.id, sprint.id);
    await setStatus(s, issue.id, "done");
    // Today a manual removal records sprintId: null. If it ever starts naming the
    // sprint it left, it must still not be mistaken for "in the sprint at close".
    await event(issue.id, s.user.id, "issue.sprint_removed", { sprintId: sprint.id, sprintName: "Sprint 1" }, new Date().toISOString());
    await closeSprint(s, sprint.id);

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 8);

    // The real close still released it once; the fake manual event adds nothing.
    expect(rows[0]).toMatchObject({ committed: 1, completed: 1 });
  });

  it("does not count an issue that was taken out of the sprint by hand before it closed", async () => {
    const s = await seed("org", "PRJ");
    const sprint = await startedSprint(s, "Sprint 1");
    const stays = await makeIssue(s);
    const removed = await makeIssue(s);
    await addToSprint(s, stays.id, sprint.id);
    await addToSprint(s, removed.id, sprint.id);
    await setStatus(s, stays.id, "done");
    await setStatus(s, removed.id, "done");
    await addToSprint(s, removed.id, null); // a plain sprint_removed, no reason
    await closeSprint(s, sprint.id);

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 8);

    expect(rows[0]).toMatchObject({ committed: 1, completed: 1 });
  });

  it("shows a completed sprint with no issues as 0 / 0", async () => {
    const s = await seed("org", "PRJ");
    const sprint = await startedSprint(s, "Empty");
    await closeSprint(s, sprint.id);

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 8);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Empty", committed: 0, completed: 0 });
  });

  it("excludes planned and active sprints", async () => {
    const s = await seed("org", "PRJ");
    await sprintsRepository.create({
      organizationId: s.org.id,
      projectId: s.project.id,
      name: "Planned",
      startDate: null,
      endDate: null,
    });
    await startedSprint(s, "Active");

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 8);

    expect(rows).toEqual([]);
  });

  it("returns the most recent N completed sprints, oldest first", async () => {
    const s = await seed("org", "PRJ");
    for (const name of ["Sprint 1", "Sprint 2", "Sprint 3"]) {
      const sprint = await startedSprint(s, name);
      await closeSprint(s, sprint.id);
    }

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 2);

    expect(rows.map((r) => r.name)).toEqual(["Sprint 2", "Sprint 3"]);
  });

  it("counts a carried-over issue in each sprint by that sprint's own release event", async () => {
    const s = await seed("org", "PRJ");
    const first = await startedSprint(s, "Sprint 1");
    const carried = await makeIssue(s);
    await addToSprint(s, carried.id, first.id);
    await setStatus(s, carried.id, "in_progress");
    await closeSprint(s, first.id);

    const second = await startedSprint(s, "Sprint 2");
    await addToSprint(s, carried.id, second.id);
    await setStatus(s, carried.id, "done");
    await closeSprint(s, second.id);

    const rows = await analyticsRepository.sprintVelocity(s.org.id, s.project.id, 8);

    expect(rows.map((r) => [r.name, r.committed, r.completed])).toEqual([
      ["Sprint 1", 1, 0],
      ["Sprint 2", 1, 1],
    ]);
  });

  it("never includes another project's or another organization's sprints", async () => {
    const a = await seed("org-a", "AAA");
    const [otherProject] = await db
      .insert(projects)
      .values({ organizationId: a.org.id, name: "Other", key: "OTH" })
      .returning();
    const b = await seed("org-b", "BBB");

    const mine = await startedSprint(a, "Mine");
    await closeSprint(a, mine.id);
    const theirs = await startedSprint(b, "Other org");
    await closeSprint(b, theirs.id);
    const elsewhere = await sprintsRepository.create({
      organizationId: a.org.id,
      projectId: otherProject!.id,
      name: "Other project",
      startDate: null,
      endDate: null,
    });
    await sprintsRepository.start({
      organizationId: a.org.id,
      projectId: otherProject!.id,
      sprintId: elsewhere.id,
      expectedVersion: elsewhere.version,
    });
    await sprintsRepository.complete({
      organizationId: a.org.id,
      projectId: otherProject!.id,
      sprintId: elsewhere.id,
      expectedVersion: await sprintVersionOf(elsewhere.id),
      actorId: a.user.id,
    });

    const rows = await analyticsRepository.sprintVelocity(a.org.id, a.project.id, 8);

    expect(rows.map((r) => r.name)).toEqual(["Mine"]);
  });
});

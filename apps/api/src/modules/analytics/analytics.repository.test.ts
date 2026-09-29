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

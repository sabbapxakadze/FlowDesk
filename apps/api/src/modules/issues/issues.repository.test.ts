import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { comments, issueEvents, issues, labels, organizations, projects, users } from "../../db/schema/index.js";
import * as issuesRepository from "./issues.repository.js";
import * as issuesService from "./issues.service.js";

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

    const result = await issuesRepository.listByProject(a.org.id, a.project.id, {
      limit: 25,
      order: "desc",
    });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe("A issue");
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

/**
 * board_rank behavior — see ADR 0007 and the Phase 5 slice 1 plan.
 * "Prove it, don't assume" applies here too: nextRankSql is a plain SQL
 * expression, easy to get subtly wrong (e.g. forgetting to scope by
 * status, or by org/project), so these run it against a real Postgres
 * database rather than trusting the query reads correctly.
 */
describe("issues repository — board ranking", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("assigns sequential ranks, spaced by 1000, within a column", async () => {
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
    const third = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Third",
      description: null,
      reporterId: user.id,
    });

    expect(first.boardRank).toBe("1000");
    expect(second.boardRank).toBe("2000");
    expect(third.boardRank).toBe("3000");
  });

  it("keeps separate ranks per column, not one shared sequence per project", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");

    const todoIssue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Stays in todo",
      description: null,
      reporterId: user.id,
    });
    const movedIssue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Moves to in_progress",
      description: null,
      reporterId: user.id,
    });

    const result = await issuesRepository.update({
      organizationId: org.id,
      projectId: project.id,
      issueId: movedIssue.id,
      expectedVersion: movedIssue.version,
      changes: { status: "in_progress" },
      actorId: user.id,
    });

    if (result.status !== "updated") throw new Error("expected updated");
    // in_progress was empty, so the moved issue is first in *that*
    // column (rank 1000) even though it's the second issue overall —
    // proves the rank sequence is per (project, status), not per project.
    expect(result.issue.boardRank).toBe("1000");
    expect(todoIssue.boardRank).toBe("1000");
  });

  it("does not touch board_rank when status is resent unchanged alongside another field", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Original title",
      description: null,
      reporterId: user.id,
    });

    // EditIssueForm always resends the current status alongside any
    // edit, even a title-only change — this must not re-rank the issue
    // to the end of its own column every time someone edits a title.
    const result = await issuesRepository.update({
      organizationId: org.id,
      projectId: project.id,
      issueId: issue.id,
      expectedVersion: issue.version,
      changes: { title: "Updated title", status: "todo" },
      actorId: user.id,
    });

    if (result.status !== "updated") throw new Error("expected updated");
    expect(result.issue.boardRank).toBe(issue.boardRank);
  });

  it("listForBoard orders by status then rank and stays tenant-scoped", async () => {
    const a = await seedOrgProjectUser("Org A", "org-a", "AAA");
    const b = await seedOrgProjectUser("Org B", "org-b", "BBB");

    const done = await issuesRepository.create({
      organizationId: a.org.id,
      projectId: a.project.id,
      title: "Will be done",
      description: null,
      reporterId: a.user.id,
    });
    await issuesRepository.update({
      organizationId: a.org.id,
      projectId: a.project.id,
      issueId: done.id,
      expectedVersion: done.version,
      changes: { status: "done" },
      actorId: a.user.id,
    });
    const todoFirst = await issuesRepository.create({
      organizationId: a.org.id,
      projectId: a.project.id,
      title: "Todo, created first",
      description: null,
      reporterId: a.user.id,
    });
    const todoSecond = await issuesRepository.create({
      organizationId: a.org.id,
      projectId: a.project.id,
      title: "Todo, created second",
      description: null,
      reporterId: a.user.id,
    });
    await issuesRepository.create({
      organizationId: b.org.id,
      projectId: b.project.id,
      title: "Org B issue",
      description: null,
      reporterId: b.user.id,
    });

    const board = await issuesRepository.listForBoard(a.org.id, a.project.id);

    expect(board.map((i) => i.title)).toEqual([
      todoFirst.title,
      todoSecond.title,
      done.title,
    ]);
    expect(board.every((i) => i.projectId === a.project.id)).toBe(true);
  });
});

/**
 * Keyset pagination's ordering/cursor behavior, same reasoning as every
 * other "prove it, don't assume" test in this file: the WHERE (created_at,
 * id) < (cursor) clause is only actually correct if paging through real
 * seeded rows returns them in the right order with no gaps or repeats,
 * not provable by reading the query. Issues are inserted directly (not
 * via issuesRepository.create()) so createdAt can be set explicitly —
 * real concurrent creates could otherwise land in the same millisecond
 * and make the ordering assertions flaky.
 */
describe("issues repository — pagination", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function seedIssues(
    org: { id: string },
    project: { id: string },
    user: { id: string },
    count: number,
  ) {
    const base = new Date("2026-01-01T00:00:00.000Z").getTime();
    return db
      .insert(issues)
      .values(
        Array.from({ length: count }, (_, i) => ({
          organizationId: org.id,
          projectId: project.id,
          number: i + 1,
          title: `Issue ${i + 1}`,
          reporterId: user.id,
          boardRank: String((i + 1) * 1000),
          createdAt: new Date(base + i * 1000),
          updatedAt: new Date(base + i * 1000),
        })),
      )
      .returning();
  }

  it("returns at most `limit` items and a non-null cursor when more remain", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    await seedIssues(org, project, user, 5);

    const result = await issuesRepository.listByProject(org.id, project.id, {
      limit: 2,
      order: "desc",
    });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });

  it("orders newest first and returns a null cursor on the last page", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    await seedIssues(org, project, user, 3);

    const result = await issuesRepository.listByProject(org.id, project.id, {
      limit: 10,
      order: "desc",
    });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.items.map((i) => i.title)).toEqual(["Issue 3", "Issue 2", "Issue 1"]);
    expect(result.nextCursor).toBeNull();
  });

  it("advances correctly across pages with no gaps or repeats", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    await seedIssues(org, project, user, 5);

    const page1 = await issuesRepository.listByProject(org.id, project.id, { limit: 2, order: "desc" });
    if (page1.status !== "ok" || !page1.nextCursor) throw new Error("expected a next page");
    expect(page1.items.map((i) => i.title)).toEqual(["Issue 5", "Issue 4"]);

    const page2 = await issuesRepository.listByProject(org.id, project.id, {
      limit: 2,
      order: "desc",
      cursor: page1.nextCursor,
    });
    if (page2.status !== "ok" || !page2.nextCursor) throw new Error("expected a next page");
    expect(page2.items.map((i) => i.title)).toEqual(["Issue 3", "Issue 2"]);

    const page3 = await issuesRepository.listByProject(org.id, project.id, {
      limit: 2,
      order: "desc",
      cursor: page2.nextCursor,
    });
    if (page3.status !== "ok") throw new Error("expected ok");
    expect(page3.items.map((i) => i.title)).toEqual(["Issue 1"]);
    expect(page3.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor instead of silently falling back to page one", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    await seedIssues(org, project, user, 2);

    const result = await issuesRepository.listByProject(org.id, project.id, {
      limit: 10,
      order: "desc",
      cursor: "not-a-real-cursor",
    });

    expect(result.status).toBe("invalid_cursor");
  });

  it("never mixes in another project's issues across pages", async () => {
    const a = await seedOrgProjectUser("Org A", "org-a", "AAA");
    const b = await seedOrgProjectUser("Org B", "org-b", "BBB");
    await seedIssues(a.org, a.project, a.user, 3);
    await seedIssues(b.org, b.project, b.user, 3);

    const result = await issuesRepository.listByProject(a.org.id, a.project.id, {
      limit: 10,
      order: "desc",
    });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.items).toHaveLength(3);
    expect(result.items.every((i) => i.projectId === a.project.id)).toBe(true);
  });

  it("filters by status", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const base = new Date("2026-01-01T00:00:00.000Z").getTime();
    await db.insert(issues).values([
      {
        organizationId: org.id,
        projectId: project.id,
        number: 1,
        title: "Todo issue",
        reporterId: user.id,
        status: "todo",
        boardRank: "1000",
        createdAt: new Date(base),
        updatedAt: new Date(base),
      },
      {
        organizationId: org.id,
        projectId: project.id,
        number: 2,
        title: "In progress issue",
        reporterId: user.id,
        status: "in_progress",
        boardRank: "1000",
        createdAt: new Date(base + 1000),
        updatedAt: new Date(base + 1000),
      },
      {
        organizationId: org.id,
        projectId: project.id,
        number: 3,
        title: "Done issue",
        reporterId: user.id,
        status: "done",
        boardRank: "1000",
        createdAt: new Date(base + 2000),
        updatedAt: new Date(base + 2000),
      },
    ]);

    const result = await issuesRepository.listByProject(org.id, project.id, {
      limit: 10,
      order: "desc",
      status: "in_progress",
    });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.items.map((i) => i.title)).toEqual(["In progress issue"]);
  });

  it("returns oldest-first with order: asc and advances the cursor forward", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    await seedIssues(org, project, user, 5);

    const page1 = await issuesRepository.listByProject(org.id, project.id, { limit: 2, order: "asc" });
    if (page1.status !== "ok" || !page1.nextCursor) throw new Error("expected a next page");
    expect(page1.items.map((i) => i.title)).toEqual(["Issue 1", "Issue 2"]);

    const page2 = await issuesRepository.listByProject(org.id, project.id, {
      limit: 2,
      order: "asc",
      cursor: page1.nextCursor,
    });
    if (page2.status !== "ok") throw new Error("expected ok");
    expect(page2.items.map((i) => i.title)).toEqual(["Issue 3", "Issue 4"]);
  });

  it("combines a status filter with cursor pagination", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const base = new Date("2026-01-01T00:00:00.000Z").getTime();
    // Alternating status: Issue 1/3/5 are "todo", Issue 2/4/6 are "done" —
    // the cursor must skip the interleaved "done" rows, not just the
    // previous page's worth of raw rows.
    await db.insert(issues).values(
      Array.from({ length: 6 }, (_, i) => ({
        organizationId: org.id,
        projectId: project.id,
        number: i + 1,
        title: `Issue ${i + 1}`,
        reporterId: user.id,
        status: i % 2 === 0 ? ("todo" as const) : ("done" as const),
        boardRank: String((i + 1) * 1000),
        createdAt: new Date(base + i * 1000),
        updatedAt: new Date(base + i * 1000),
      })),
    );

    const page1 = await issuesRepository.listByProject(org.id, project.id, {
      limit: 2,
      order: "desc",
      status: "todo",
    });
    if (page1.status !== "ok" || !page1.nextCursor) throw new Error("expected a next page");
    expect(page1.items.map((i) => i.title)).toEqual(["Issue 5", "Issue 3"]);

    const page2 = await issuesRepository.listByProject(org.id, project.id, {
      limit: 2,
      order: "desc",
      status: "todo",
      cursor: page1.nextCursor,
    });
    if (page2.status !== "ok") throw new Error("expected ok");
    expect(page2.items.map((i) => i.title)).toEqual(["Issue 1"]);
    expect(page2.nextCursor).toBeNull();
  });
});

/**
 * The concurrent-update test is the important one here, same reasoning as
 * slice 1's concurrent-create test: the conditional UPDATE...WHERE version
 * is only actually safe if Postgres genuinely refuses the second of two
 * concurrent updates starting from the same version, and that's not
 * provable by reading the code, only by racing it for real.
 */
describe("issues repository — update", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("applies the change and bumps the version on a matching version", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Original title",
      description: null,
      reporterId: user.id,
    });

    const result = await issuesRepository.update({
      organizationId: org.id,
      projectId: project.id,
      issueId: issue.id,
      expectedVersion: issue.version,
      changes: { title: "Updated title" },
      actorId: user.id,
    });

    expect(result.status).toBe("updated");
    if (result.status !== "updated") throw new Error("expected updated");
    expect(result.issue.title).toBe("Updated title");
    expect(result.issue.version).toBe(issue.version + 1);
  });

  it("writes exactly one issue.updated event with the changed fields as payload", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Original title",
      description: null,
      reporterId: user.id,
    });

    await issuesRepository.update({
      organizationId: org.id,
      projectId: project.id,
      issueId: issue.id,
      expectedVersion: issue.version,
      changes: { status: "in_progress" },
      actorId: user.id,
    });

    // create() already wrote an issue.created event for this issue —
    // filter to the update event specifically rather than asserting a
    // total count.
    const updateEvents = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issue.id), eq(issueEvents.type, "issue.updated")));

    expect(updateEvents).toHaveLength(1);
    expect(updateEvents[0]?.payload).toEqual({ status: "in_progress" });
  });

  it("returns a conflict without mutating the row when the version is stale", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Original title",
      description: null,
      reporterId: user.id,
    });

    const staleResult = await issuesRepository.update({
      organizationId: org.id,
      projectId: project.id,
      issueId: issue.id,
      expectedVersion: issue.version + 5, // never actually reached
      changes: { title: "Should not apply" },
      actorId: user.id,
    });

    expect(staleResult.status).toBe("conflict");
    if (staleResult.status !== "conflict") throw new Error("expected conflict");
    expect(staleResult.current.title).toBe("Original title");
    expect(staleResult.current.version).toBe(issue.version);

    // Only the create's issue.created event should exist — no
    // issue.updated event for a change that never applied.
    const updateEvents = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issue.id), eq(issueEvents.type, "issue.updated")));
    expect(updateEvents).toHaveLength(0);
  });

  it("lets exactly one of two concurrent updates starting from the same version succeed", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Original title",
      description: null,
      reporterId: user.id,
    });

    const [resultA, resultB] = await Promise.all([
      issuesRepository.update({
        organizationId: org.id,
        projectId: project.id,
        issueId: issue.id,
        expectedVersion: issue.version,
        changes: { title: "Title from A" },
        actorId: user.id,
      }),
      issuesRepository.update({
        organizationId: org.id,
        projectId: project.id,
        issueId: issue.id,
        expectedVersion: issue.version,
        changes: { title: "Title from B" },
        actorId: user.id,
      }),
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toEqual(["conflict", "updated"]);
  });
});

/**
 * move() — see ADR 0007 / the Phase 5 slice 2 plan. The rebalance test is
 * the important one: everything else here is provable by reading the
 * query, but "does the scheme actually stay bounded under repeated
 * bisection, or does it silently grow forever" is only provable by
 * actually forcing it deep and watching what happens.
 */
describe("issues repository — move", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("appends to the end of the target column when no neighbors are given", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const first = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "First",
      description: null,
      reporterId: user.id,
    });
    const mover = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Mover",
      description: null,
      reporterId: user.id,
    });

    const result = await issuesRepository.move({
      organizationId: org.id,
      projectId: project.id,
      issueId: mover.id,
      expectedVersion: mover.version,
      status: "in_progress",
      actorId: user.id,
    });

    if (result.status !== "moved") throw new Error("expected moved");
    expect(result.issue.status).toBe("in_progress");
    expect(result.issue.boardRank).toBe("1000"); // first in an empty column
    expect(first.boardRank).toBe("1000"); // untouched, different column
  });

  it("inserts between two neighbors at the exact midpoint", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const a = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "A",
      description: null,
      reporterId: user.id,
    });
    const b = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "B",
      description: null,
      reporterId: user.id,
    });
    const mover = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Mover",
      description: null,
      reporterId: user.id,
    });

    const result = await issuesRepository.move({
      organizationId: org.id,
      projectId: project.id,
      issueId: mover.id,
      expectedVersion: mover.version,
      status: "todo",
      prevIssueId: a.id,
      nextIssueId: b.id,
      actorId: user.id,
    });

    if (result.status !== "moved") throw new Error("expected moved");
    expect(a.boardRank).toBe("1000");
    expect(b.boardRank).toBe("2000");
    expect(result.issue.boardRank).toBe("1500");
  });

  it("inserts at the start of a column when only nextIssueId is given", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const a = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "A",
      description: null,
      reporterId: user.id,
    });
    const mover = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Mover",
      description: null,
      reporterId: user.id,
    });

    const result = await issuesRepository.move({
      organizationId: org.id,
      projectId: project.id,
      issueId: mover.id,
      expectedVersion: mover.version,
      status: "todo",
      nextIssueId: a.id,
      actorId: user.id,
    });

    if (result.status !== "moved") throw new Error("expected moved");
    expect(a.boardRank).toBe("1000");
    expect(result.issue.boardRank).toBe("500");
  });

  it("writes an issue.moved event with fromStatus/toStatus on a cross-column move", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Issue",
      description: null,
      reporterId: user.id,
    });

    await issuesRepository.move({
      organizationId: org.id,
      projectId: project.id,
      issueId: issue.id,
      expectedVersion: issue.version,
      status: "in_progress",
      actorId: user.id,
    });

    const events = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issue.id), eq(issueEvents.type, "issue.moved")));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ fromStatus: "todo", toStatus: "in_progress" });
  });

  it("writes an issue.moved event even for a same-column reorder", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const a = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "A",
      description: null,
      reporterId: user.id,
    });
    const b = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "B",
      description: null,
      reporterId: user.id,
    });

    // Move B to the very start (before A) — same column throughout.
    await issuesRepository.move({
      organizationId: org.id,
      projectId: project.id,
      issueId: b.id,
      expectedVersion: b.version,
      status: "todo",
      nextIssueId: a.id,
      actorId: user.id,
    });

    const events = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, b.id), eq(issueEvents.type, "issue.moved")));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ fromStatus: "todo", toStatus: "todo" });
  });

  it("returns a conflict without moving the row when the version is stale", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Issue",
      description: null,
      reporterId: user.id,
    });

    const result = await issuesRepository.move({
      organizationId: org.id,
      projectId: project.id,
      issueId: issue.id,
      expectedVersion: issue.version + 5,
      status: "done",
      actorId: user.id,
    });

    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") throw new Error("expected conflict");
    expect(result.current.status).toBe("todo");
    expect(result.current.boardRank).toBe(issue.boardRank);
  });

  it("rejects a neighbor that doesn't exist or isn't in the target column", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const other = await seedOrgProjectUser("Other Org", "other-org", "OTH");
    const mover = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Mover",
      description: null,
      reporterId: user.id,
    });
    const foreignIssue = await issuesRepository.create({
      organizationId: other.org.id,
      projectId: other.project.id,
      title: "Foreign",
      description: null,
      reporterId: other.user.id,
    });

    const missingResult = await issuesRepository.move({
      organizationId: org.id,
      projectId: project.id,
      issueId: mover.id,
      expectedVersion: mover.version,
      status: "todo",
      nextIssueId: "00000000-0000-0000-0000-000000000000",
      actorId: user.id,
    });
    expect(missingResult.status).toBe("invalid_neighbor");

    const foreignResult = await issuesRepository.move({
      organizationId: org.id,
      projectId: project.id,
      issueId: mover.id,
      expectedVersion: mover.version,
      status: "todo",
      nextIssueId: foreignIssue.id,
      actorId: user.id,
    });
    expect(foreignResult.status).toBe("invalid_neighbor");
  });

  it("keeps board_rank's decimal precision bounded across deep repeated bisection", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const lower = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Lower bound",
      description: null,
      reporterId: user.id,
    });
    let mover = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Mover",
      description: null,
      reporterId: user.id,
    });
    // Every round bisects the gap between `lower` (fixed at 1000) and
    // the *previous* round's result — a genuinely deepening sequence,
    // not the same insert repeated (which would just tie every time).
    let upperNeighbor = mover;

    const scalesSeen: number[] = [];
    for (let i = 0; i < 30; i++) {
      const result = await issuesRepository.move({
        organizationId: org.id,
        projectId: project.id,
        issueId: mover.id,
        expectedVersion: mover.version,
        status: "todo",
        prevIssueId: lower.id,
        nextIssueId: upperNeighbor.id,
        actorId: user.id,
      });
      if (result.status !== "moved") throw new Error(`expected moved, got ${result.status}`);
      mover = result.issue;
      upperNeighbor = mover;
      const decimalPart = mover.boardRank.split(".")[1];
      scalesSeen.push(decimalPart?.length ?? 0);
    }

    // 10 matches MAX_RANK_SCALE — see its comment in issues.repository.ts
    // for why it's *not* 20: Postgres's numeric `/` isn't actually
    // unlimited-precision the way +/-/* are (confirmed directly against
    // this project's own Postgres instance while building this — a
    // fixed-gap-1000 bisection sequence like this one empirically caps
    // around scale 16 no matter how many more times it's halved, since
    // `/` silently rounds rather than growing precision further). A
    // threshold near that ceiling would never fire — this asserts it
    // fires well before, with real margin, not just "eventually".
    expect(Math.max(...scalesSeen)).toBeLessThanOrEqual(10);
  });
});

describe("issues repository — labels", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("attaches a label and writes exactly one issue.label_added event", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Issue",
      description: null,
      reporterId: user.id,
    });
    const [label] = await db
      .insert(labels)
      .values({ organizationId: org.id, name: "bug", color: "#FF0000" })
      .returning();
    if (!label) throw new Error("setup failed");

    const result = await issuesRepository.attachLabel({
      organizationId: org.id,
      issueId: issue.id,
      labelId: label.id,
      actorId: user.id,
    });

    expect(result.status).toBe("attached");

    const attached = await issuesRepository.listLabelsForIssue(org.id, issue.id);
    expect(attached).toHaveLength(1);
    expect(attached[0]?.name).toBe("bug");

    const addEvents = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issue.id), eq(issueEvents.type, "issue.label_added")));
    expect(addEvents).toHaveLength(1);
    expect(addEvents[0]?.payload).toEqual({ labelId: label.id, labelName: "bug" });
  });

  it("rejects attaching a label from a different organization", async () => {
    const a = await seedOrgProjectUser("Org A", "org-a", "AAA");
    const b = await seedOrgProjectUser("Org B", "org-b", "BBB");
    const issue = await issuesRepository.create({
      organizationId: a.org.id,
      projectId: a.project.id,
      title: "Issue",
      description: null,
      reporterId: a.user.id,
    });
    const [foreignLabel] = await db
      .insert(labels)
      .values({ organizationId: b.org.id, name: "bug", color: "#FF0000" })
      .returning();
    if (!foreignLabel) throw new Error("setup failed");

    const result = await issuesRepository.attachLabel({
      organizationId: a.org.id,
      issueId: issue.id,
      labelId: foreignLabel.id,
      actorId: a.user.id,
    });

    expect(result.status).toBe("label_not_found");
  });

  it("detaches a label and writes exactly one issue.label_removed event", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Issue",
      description: null,
      reporterId: user.id,
    });
    const [label] = await db
      .insert(labels)
      .values({ organizationId: org.id, name: "bug", color: "#FF0000" })
      .returning();
    if (!label) throw new Error("setup failed");
    await issuesRepository.attachLabel({
      organizationId: org.id,
      issueId: issue.id,
      labelId: label.id,
      actorId: user.id,
    });

    const result = await issuesRepository.detachLabel({
      organizationId: org.id,
      issueId: issue.id,
      labelId: label.id,
      actorId: user.id,
    });

    expect(result.status).toBe("detached");
    expect(await issuesRepository.listLabelsForIssue(org.id, issue.id)).toHaveLength(0);

    const removeEvents = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issue.id), eq(issueEvents.type, "issue.label_removed")));
    expect(removeEvents).toHaveLength(1);
  });

  it("rejects attaching the same label twice with a 409", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Issue",
      description: null,
      reporterId: user.id,
    });
    const [label] = await db
      .insert(labels)
      .values({ organizationId: org.id, name: "bug", color: "#FF0000" })
      .returning();
    if (!label) throw new Error("setup failed");

    await issuesService.attachLabel({
      organizationId: org.id,
      issueId: issue.id,
      labelId: label.id,
      actorId: user.id,
    });

    await expect(
      issuesService.attachLabel({
        organizationId: org.id,
        issueId: issue.id,
        labelId: label.id,
        actorId: user.id,
      }),
    ).rejects.toMatchObject({ status: 409, code: "label_already_attached" });
  });

  it("is idempotent when detaching a label that was never attached", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Issue",
      description: null,
      reporterId: user.id,
    });
    const [label] = await db
      .insert(labels)
      .values({ organizationId: org.id, name: "bug", color: "#FF0000" })
      .returning();
    if (!label) throw new Error("setup failed");

    const result = await issuesRepository.detachLabel({
      organizationId: org.id,
      issueId: issue.id,
      labelId: label.id,
      actorId: user.id,
    });

    expect(result.status).toBe("detached");
    const removeEvents = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issue.id), eq(issueEvents.type, "issue.label_removed")));
    expect(removeEvents).toHaveLength(0);
  });
});

describe("issues repository — comments and activity timeline", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("posts a comment and writes exactly one issue.commented event with the body in its payload", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Issue",
      description: null,
      reporterId: user.id,
    });

    const comment = await issuesRepository.addComment({
      issueId: issue.id,
      authorId: user.id,
      body: "This is a comment",
    });

    expect(comment.body).toBe("This is a comment");

    const stored = await db.select().from(comments).where(eq(comments.id, comment.id));
    expect(stored).toHaveLength(1);

    const commentEvents = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issue.id), eq(issueEvents.type, "issue.commented")));
    expect(commentEvents).toHaveLength(1);
    expect(commentEvents[0]?.payload).toEqual({ commentId: comment.id, body: "This is a comment" });
  });

  it("lists a real issue's whole life in chronological order with actor names", async () => {
    const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
    const [label] = await db
      .insert(labels)
      .values({ organizationId: org.id, name: "bug", color: "#FF0000" })
      .returning();
    if (!label) throw new Error("setup failed");

    const issue = await issuesRepository.create({
      organizationId: org.id,
      projectId: project.id,
      title: "Issue",
      description: null,
      reporterId: user.id,
    });
    await issuesRepository.update({
      organizationId: org.id,
      projectId: project.id,
      issueId: issue.id,
      expectedVersion: issue.version,
      changes: { status: "in_progress" },
      actorId: user.id,
    });
    await issuesRepository.attachLabel({
      organizationId: org.id,
      issueId: issue.id,
      labelId: label.id,
      actorId: user.id,
    });
    await issuesRepository.addComment({
      issueId: issue.id,
      authorId: user.id,
      body: "Looking into this",
    });

    const events = await issuesRepository.listEvents(org.id, issue.id);

    expect(events.map((e) => e.type)).toEqual([
      "issue.created",
      "issue.updated",
      "issue.label_added",
      "issue.commented",
    ]);
    expect(events.every((e) => e.actorName === "Test User")).toBe(true);
    // Chronological, not just "same order they were created in the test" —
    // each event's createdAt should be non-decreasing.
    const timestamps = events.map((e) => new Date(e.createdAt).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it("only returns events for the requested organization's issue", async () => {
    const a = await seedOrgProjectUser("Org A", "org-a", "AAA");
    const b = await seedOrgProjectUser("Org B", "org-b", "BBB");
    const issueA = await issuesRepository.create({
      organizationId: a.org.id,
      projectId: a.project.id,
      title: "A issue",
      description: null,
      reporterId: a.user.id,
    });

    const events = await issuesRepository.listEvents(b.org.id, issueA.id);

    expect(events).toEqual([]);
  });
});

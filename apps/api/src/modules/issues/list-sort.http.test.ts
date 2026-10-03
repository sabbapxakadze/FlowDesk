import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { issues } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * Sorting the issue list by priority (ADR 0026). Real Postgres and real HTTP. The expected
 * order is computed here, in plain JS, from the rows the test itself created, so the SQL is
 * checked against a second, independent computation.
 */

const RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;

async function setup() {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "owner@example.com", password: "password123", name: "Owner", organizationName: "Org A" })
    .expect(201);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "owner@example.com", password: "password123" })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
  const organizationId = login.body.organization.id as string;
  const project = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects`)
    .set(auth)
    .send({ name: "Project", key: "AAA" })
    .expect(201);
  const base = `/api/v1/organizations/${organizationId}/projects/${project.body.data.id as string}`;
  return { base, auth };
}

type Made = { id: string; priority: string; createdAt: Date; status: string };

/**
 * Creates `count` issues. Priorities cycle through the five values (so every page boundary
 * lands inside a group of equal priorities), and created_at is set explicitly one minute
 * apart so "newest first" has an unambiguous answer.
 */
async function makeIssues(ctx: Awaited<ReturnType<typeof setup>>, count: number) {
  const made: Made[] = [];
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < count; i++) {
    const created = await request(app).post(`${ctx.base}/issues`).set(ctx.auth).send({ title: `Issue ${i}` }).expect(201);
    const id = created.body.data.id as string;
    const priority = PRIORITIES[i % PRIORITIES.length]!;
    const status = i % 3 === 0 ? "in_progress" : "todo";
    const createdAt = new Date(start + i * 60_000);
    await db.update(issues).set({ priority, status, createdAt }).where(eq(issues.id, id));
    made.push({ id, priority, createdAt, status });
  }
  return made;
}

/** The ordering the API promises, computed independently. */
function expectedOrder(made: Made[], order: "asc" | "desc") {
  const sign = order === "desc" ? -1 : 1;
  return [...made]
    .sort(
      (a, b) =>
        sign *
        (RANK[a.priority]! - RANK[b.priority]! ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    )
    .map((m) => m.id);
}

async function pageThrough(ctx: Awaited<ReturnType<typeof setup>>, query: string, limit: number) {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const res: request.Response = await request(app)
      .get(`${ctx.base}/issues?limit=${limit}${query}${cursor ? `&cursor=${cursor}` : ""}`)
      .set(ctx.auth)
      .expect(200);
    ids.push(...res.body.data.map((i: { id: string }) => i.id));
    cursor = res.body.nextCursor;
    pages++;
  } while (cursor && pages < 50);
  return { ids, pages };
}

describe("issue list sorted by priority", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("highest priority first, newest first within a priority, across several pages with nothing skipped or repeated", async () => {
    const ctx = await setup();
    const made = await makeIssues(ctx, 23);
    const { ids, pages } = await pageThrough(ctx, "&sort=priority", 4);

    expect(pages).toBeGreaterThan(4); // really paged
    expect(ids).toHaveLength(23);
    expect(new Set(ids).size).toBe(23); // no repeats
    expect(ids).toEqual(expectedOrder(made, "desc"));
    // And in plain terms: the first page is all urgent, newest first.
    const first = made.filter((m) => m.priority === "urgent").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    expect(ids.slice(0, 4)).toEqual(first.slice(0, 4).map((m) => m.id));
  });

  it("ascending flips the whole key (lowest priority first, oldest first)", async () => {
    const ctx = await setup();
    const made = await makeIssues(ctx, 17);
    const { ids } = await pageThrough(ctx, "&sort=priority&order=asc", 5);
    expect(ids).toEqual(expectedOrder(made, "asc"));
  });

  it("a page boundary that falls inside a group of equal priorities does not lose or repeat rows", async () => {
    // Why: the cursor must carry the priority AND the creation time, not just one of them.
    const ctx = await setup();
    const made = await makeIssues(ctx, 30); // six issues of each priority
    for (const limit of [1, 2, 3, 5, 6, 7]) {
      const { ids } = await pageThrough(ctx, "&sort=priority", limit);
      expect(ids, `limit ${limit}`).toEqual(expectedOrder(made, "desc"));
    }
  });

  it("combines with filters: only the matching issues, in priority order", async () => {
    const ctx = await setup();
    const made = await makeIssues(ctx, 24);
    const { ids } = await pageThrough(ctx, "&sort=priority&status=in_progress", 3);
    expect(ids).toEqual(expectedOrder(made.filter((m) => m.status === "in_progress"), "desc"));

    const onlyHigh = await pageThrough(ctx, "&sort=priority&priority=high", 2);
    expect(onlyHigh.ids).toEqual(expectedOrder(made.filter((m) => m.priority === "high"), "desc"));
  });

  it("without sort the list is unchanged: newest first by creation time", async () => {
    const ctx = await setup();
    const made = await makeIssues(ctx, 12);
    const { ids } = await pageThrough(ctx, "", 5);
    expect(ids).toEqual([...made].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((m) => m.id));
  });

  it("a cursor from one sort is refused by the other, and a bad sort value is a validation error", async () => {
    // Why: replaying a cursor against a different sort would silently skip or repeat rows.
    const ctx = await setup();
    await makeIssues(ctx, 8);
    const byPriority = await request(app).get(`${ctx.base}/issues?limit=2&sort=priority`).set(ctx.auth).expect(200);
    const byCreated = await request(app).get(`${ctx.base}/issues?limit=2`).set(ctx.auth).expect(200);

    const a = await request(app)
      .get(`${ctx.base}/issues?limit=2&cursor=${byPriority.body.nextCursor}`)
      .set(ctx.auth)
      .expect(400);
    expect(a.body.error.code).toBe("invalid_cursor");
    const b = await request(app)
      .get(`${ctx.base}/issues?limit=2&sort=priority&cursor=${byCreated.body.nextCursor}`)
      .set(ctx.auth)
      .expect(400);
    expect(b.body.error.code).toBe("invalid_cursor");

    const bad = await request(app).get(`${ctx.base}/issues?sort=title`).set(ctx.auth).expect(400);
    expect(bad.body.error.code).toBe("validation_error");

    // A priority cursor with a made-up priority is refused too.
    const forged = Buffer.from(
      JSON.stringify({ createdAt: new Date().toISOString(), id: byPriority.body.data[0].id, priority: "critical" }),
    ).toString("base64url");
    await request(app).get(`${ctx.base}/issues?sort=priority&cursor=${forged}`).set(ctx.auth).expect(400);
  });

  it("another organization still cannot read this project's issues, sorted or not (tenant isolation)", async () => {
    const ctx = await setup();
    await makeIssues(ctx, 3);
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "other@example.com", password: "password123", name: "Other", organizationName: "Org B" })
      .expect(201);
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "other@example.com", password: "password123" })
      .expect(200);
    await request(app)
      .get(`${ctx.base}/issues?sort=priority`)
      .set({ Authorization: `Bearer ${login.body.accessToken as string}` })
      .expect(403);
  });
});

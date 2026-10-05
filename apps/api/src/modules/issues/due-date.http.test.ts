import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents } from "../../db/schema/index.js";

/**
 * Issue due dates (ADR 0032). Real Postgres, real HTTP. A due date is a calendar day ("YYYY-MM-DD"), never a moment.
 * Each test says what bug it would catch.
 */
async function setup(email = "owner@example.com") {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name: "Owner", organizationName: `Org ${email}` })
    .expect(201);
  const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" }).expect(200);
  const token = loginRes.body.accessToken as string;
  const organizationId = loginRes.body.organization.id as string;
  const projectRes = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Project", key: "AAA" })
    .expect(201);
  const projectId = projectRes.body.data.id as string;
  const base = `/api/v1/organizations/${organizationId}/projects/${projectId}`;
  const auth = { Authorization: `Bearer ${token}` };

  async function createIssue(title: string) {
    const res = await request(app).post(`${base}/issues`).set(auth).send({ title }).expect(201);
    return res.body.data as { id: string; version: number; dueDate: string | null };
  }
  const patch = (issue: { id: string }, body: object) => request(app).patch(`${base}/issues/${issue.id}`).set(auth).send(body);
  const list = (query: string) => request(app).get(`${base}/issues?${query}`).set(auth).expect(200);
  return { base, auth, createIssue, patch, list };
}

describe("issue due date (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("a new issue has no due date; PATCH sets, changes and clears it with one event each", async () => {
    // Catches: a missing column, a date that is not stored as given, or a change that leaves no trace in the timeline.
    const { createIssue, patch } = await setup();
    const issue = await createIssue("Needs a date");
    expect(issue.dueDate).toBeNull();

    const set = await patch(issue, { version: issue.version, dueDate: "2026-10-12" }).expect(200);
    expect(set.body.data.dueDate).toBe("2026-10-12"); // the same day back, not a timestamp
    expect(set.body.data.version).toBe(issue.version + 1);
    const changed = await patch(issue, { version: set.body.data.version, dueDate: "2026-11-01" }).expect(200);
    const cleared = await patch(issue, { version: changed.body.data.version, dueDate: null }).expect(200);
    expect(cleared.body.data.dueDate).toBeNull();

    const events = await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.updated"));
    expect(events.map((e) => e.payload)).toEqual([{ dueDate: "2026-10-12" }, { dueDate: "2026-11-01" }, { dueDate: null }]); // a clear keeps the key
  });

  it("sending the same date again changes nothing: no new version, no event", async () => {
    // Catches: the edit form resending an unchanged date and logging "set the due date" on every save.
    const { createIssue, patch } = await setup();
    const issue = await createIssue("Same");
    const first = await patch(issue, { version: issue.version, dueDate: "2026-10-12" }).expect(200);
    const again = await patch(issue, { version: first.body.data.version, dueDate: "2026-10-12", title: "Same" }).expect(200);
    expect(again.body.data.version).toBe(first.body.data.version);
    expect(await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.updated"))).toHaveLength(1);
  });

  it("only a real calendar day is accepted", async () => {
    // Catches: a timestamp or an impossible date reaching the date column (Postgres would 500, or shift the day).
    const { createIssue, patch } = await setup();
    const issue = await createIssue("Strict");
    for (const bad of ["2026-13-40", "2026-10-12T10:00:00Z", "tomorrow", "12/10/2026"]) {
      await patch(issue, { version: issue.version, dueDate: bad }).expect(400);
    }
  });

  it("due=overdue lists only past, unfinished issues relative to the caller's `today`; due=none lists the undated", async () => {
    // Catches: done issues shown as overdue, today counted as overdue, the caller's day ignored, undated issues leaking in.
    const { createIssue, patch, list } = await setup();
    const make = async (title: string, dueDate: string | null, status?: string) => {
      const issue = await createIssue(title);
      const res = await patch(issue, { version: issue.version, ...(dueDate ? { dueDate } : {}), ...(status ? { status } : {}) });
      expect(res.status).toBe(dueDate || status ? 200 : 400);
      return issue;
    };
    await make("past", "2026-10-04");
    await make("past but done", "2026-10-04", "done");
    await make("today", "2026-10-05");
    await make("future", "2026-10-06");
    await createIssue("undated");

    const titles = (res: { body: { data: { title: string }[] } }) => res.body.data.map((i) => i.title).sort();
    expect(titles(await list("due=overdue&today=2026-10-05"))).toEqual(["past"]);
    expect(titles(await list("due=overdue&today=2026-10-06"))).toEqual(["past", "today"]); // the caller's day decides
    expect(titles(await list("due=none"))).toEqual(["undated"]);
    expect((await list("due=overdue&today=2026-10-05")).body.data[0].dueDate).toBe("2026-10-04");
  });

  it("another organization cannot set a due date on this issue", async () => {
    // Catches: the new field bypassing tenant scoping on update.
    const a = await setup("a@example.com");
    const issue = await a.createIssue("Mine");
    const b = await setup("b@example.com");
    await request(app).patch(`${a.base}/issues/${issue.id}`).set(b.auth).send({ version: issue.version, dueDate: "2026-10-12" }).expect(403);
    const own = await request(app).get(`${a.base}/issues/${issue.id}`).set(a.auth).expect(200);
    expect(own.body.data.dueDate).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents } from "../../db/schema/index.js";

/**
 * Issue priority (Phase 8.5 slice 2A). Real Postgres, real HTTP. Each test
 * says what bug it would catch.
 */
async function setup() {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "owner@example.com", password: "password123", name: "Owner", organizationName: "Org A" })
    .expect(201);
  const loginRes = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "owner@example.com", password: "password123" })
    .expect(200);
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
    return res.body.data as { id: string; version: number; priority: string };
  }
  return { base, auth, createIssue };
}

describe("issue priority (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("a new issue has priority none", async () => {
    // Catches: a missing column default, or a NULL leaking into the contract.
    const { createIssue } = await setup();
    const issue = await createIssue("Fresh");
    expect(issue.priority).toBe("none");
  });

  it("PATCH sets the priority, bumps the version and writes one event naming it", async () => {
    // Catches: a priority change that is not persisted, not version-checked, or
    // leaves no trace in the activity timeline.
    const { base, auth, createIssue } = await setup();
    const issue = await createIssue("Needs priority");

    const res = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, priority: "high" })
      .expect(200);
    expect(res.body.data.priority).toBe("high");
    expect(res.body.data.version).toBe(issue.version + 1);

    const events = await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.updated"));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ priority: "high" });

    const fetched = await request(app).get(`${base}/issues/${issue.id}`).set(auth).expect(200);
    expect(fetched.body.data.priority).toBe("high");
  });

  it("a stale version is a 409 and does not change the priority", async () => {
    // Catches: priority bypassing the optimistic-concurrency check.
    const { base, auth, createIssue } = await setup();
    const issue = await createIssue("Contested");
    await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, priority: "low" })
      .expect(200);

    const stale = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, priority: "urgent" })
      .expect(409);
    expect(stale.body.error.code).toBe("version_conflict");
    expect(stale.body.error.data.current.priority).toBe("low");
  });

  it("rejects a priority that is not in the list", async () => {
    // Catches: the enum being enforced only by Postgres (a 500) instead of the contract (a 400).
    const { base, auth, createIssue } = await setup();
    const issue = await createIssue("Bad value");
    const res = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, priority: "critical" })
      .expect(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("?priority= filters the list, combines with ?status=, and rejects an unknown value", async () => {
    // Catches: a filter that is ignored, applied to the wrong column, or a 500 on bad input.
    const { base, auth, createIssue } = await setup();
    const a = await createIssue("High and todo");
    const b = await createIssue("High and done");
    await createIssue("Untouched");
    await request(app).patch(`${base}/issues/${a.id}`).set(auth).send({ version: a.version, priority: "high" }).expect(200);
    await request(app)
      .patch(`${base}/issues/${b.id}`)
      .set(auth)
      .send({ version: b.version, priority: "high", status: "done" })
      .expect(200);

    const high = await request(app).get(`${base}/issues?priority=high`).set(auth).expect(200);
    expect(high.body.data.map((i: { title: string }) => i.title).sort()).toEqual(["High and done", "High and todo"]);

    const highDone = await request(app).get(`${base}/issues?priority=high&status=done`).set(auth).expect(200);
    expect(highDone.body.data.map((i: { title: string }) => i.title)).toEqual(["High and done"]);

    const none = await request(app).get(`${base}/issues?priority=none`).set(auth).expect(200);
    expect(none.body.data.map((i: { title: string }) => i.title)).toEqual(["Untouched"]);

    await request(app).get(`${base}/issues?priority=bogus`).set(auth).expect(400);
  });

  it("the board response carries the priority", async () => {
    // Catches: priority missing from the board endpoint, so cards could not show it.
    const { base, auth, createIssue } = await setup();
    const issue = await createIssue("On the board");
    await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, priority: "urgent" })
      .expect(200);
    const board = await request(app).get(`${base}/board`).set(auth).expect(200);
    expect(board.body.data[0].priority).toBe("urgent");
  });
});

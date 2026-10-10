import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";

/** The Projects page's numbers (ADR 0059), over real HTTP and the real database. */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string; userId: string };

async function registerAndLogIn(email: string, organizationName: string): Promise<Session> {
  await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name: "Owner Person", organizationName }).expect(201);
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return { token: res.body.accessToken, organizationId: res.body.organization.id, userId: res.body.user.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const org = (s: Session) => `/api/v1/organizations/${s.organizationId}`;

async function makeProject(s: Session, name: string, key: string) {
  const res = await request(app).post(`${org(s)}/projects`).set(as(s)).send({ name, key }).expect(201);
  return res.body.data.id as string;
}
async function makeIssue(s: Session, projectId: string, title: string, change: { status?: string; dueDate?: string } = {}) {
  const res = await request(app).post(`${org(s)}/projects/${projectId}/issues`).set(as(s)).send({ title }).expect(201);
  if (change.status || change.dueDate) {
    await request(app).patch(`${org(s)}/projects/${projectId}/issues/${res.body.data.id}`).set(as(s)).send({ version: res.body.data.version, ...change }).expect(200);
  }
}
const summary = (s: Session, query = "") => request(app).get(`${org(s)}/projects/summary${query}`).set(as(s));
const byProject = (body: { data: { projectId: string }[] }, projectId: string) => body.data.find((row) => row.projectId === projectId) as Record<string, unknown>;

describe("project summaries", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("counts open, in progress, overdue, done and total, with the edges the page relies on", async () => {
    // Why: the numbers on every card. A done issue is not open and never overdue; an issue due TODAY is not overdue; an issue with no due date never is.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const web = await makeProject(owner, "Website", "WEB");
    await makeIssue(owner, web, "Todo, no date");
    await makeIssue(owner, web, "Todo, late", { dueDate: "2026-10-09" });
    await makeIssue(owner, web, "In progress, due today", { status: "in_progress", dueDate: "2026-10-11" });
    await makeIssue(owner, web, "Done, long overdue", { status: "done", dueDate: "2026-10-01" });
    const res = await summary(owner, "?today=2026-10-11").expect(200);
    expect(byProject(res.body, web)).toMatchObject({ open: 3, inProgress: 1, overdue: 1, done: 1, total: 4 });
  });

  it("a project with no issues comes back with zeros, no sprint and no last change", async () => {
    // Why: a new project must still get a card (the LEFT side of the join), not vanish from the page.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const empty = await makeProject(owner, "Empty", "EMP");
    const res = await summary(owner).expect(200);
    expect(byProject(res.body, empty)).toMatchObject({ open: 0, inProgress: 0, overdue: 0, done: 0, total: 0, activeSprint: null, lastChangeAt: null });
  });

  it("reports only a running sprint, and a project's last change", async () => {
    // Why: the card shows the active sprint and "updated ...". A planned or finished sprint is not "active".
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const web = await makeProject(owner, "Website", "WEB");
    const api = await makeProject(owner, "Backend", "API");
    await makeIssue(owner, web, "Something");
    const sprintsPath = `${org(owner)}/projects/${web}/sprints`;
    await request(app).post(sprintsPath).set(as(owner)).send({ name: "Planned only" }).expect(201);
    const running = (await request(app).post(sprintsPath).set(as(owner)).send({ name: "Sprint 7", endDate: "2026-10-15" }).expect(201)).body.data;
    await request(app).patch(`${sprintsPath}/${running.id}/start`).set(as(owner)).send({ version: running.version }).expect(200);
    const res = await summary(owner).expect(200);
    expect(byProject(res.body, web).activeSprint).toEqual({ name: "Sprint 7", endDate: "2026-10-15" });
    expect(typeof byProject(res.body, web).lastChangeAt).toBe("string");
    expect(byProject(res.body, api).activeSprint).toBeNull();
  });

  it("never includes another organization's projects, needs a signed-in member, and refuses a bad date", async () => {
    // Why: tenant scoping, authentication, and input checks, as for every read.
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    const inA = await makeProject(a, "Plans A", "PLA");
    const inB = await makeProject(b, "Plans B", "PLB");
    await makeIssue(b, inB, "B's issue");
    const res = await summary(a).expect(200);
    expect(res.body.data.map((row: { projectId: string }) => row.projectId)).toEqual([inA]);
    await request(app).get(`${org(b)}/projects/summary`).set(as(a)).expect(403); // a is not a member of b
    await request(app).get(`${org(a)}/projects/summary`).expect(401);
    await summary(a, "?today=tomorrow").expect(400);
  });
});

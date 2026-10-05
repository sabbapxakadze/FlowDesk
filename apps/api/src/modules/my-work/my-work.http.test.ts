import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { organizationMembers } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";

/** "My work": the open issues assigned to the caller across projects, over real HTTP and the real database. */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string; userId: string };

async function registerAndLogIn(email: string, organizationName: string, name = "Owner Person"): Promise<Session> {
  await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name, organizationName }).expect(201);
  return logIn(email);
}
async function logIn(email: string): Promise<Session> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return { token: res.body.accessToken, organizationId: res.body.organization.id, userId: res.body.user.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const org = (s: Session) => `/api/v1/organizations/${s.organizationId}`;

async function addPerson(owner: Session, email: string, role: "admin" | "member" | "viewer", name: string) {
  const invited = await request(app).post(`${org(owner)}/invitations`).set(as(owner)).send({ email, role }).expect(201);
  const token = new URL(invited.body.inviteUrl).searchParams.get("token")!;
  await request(app).post("/api/v1/invitations/accept").send({ token, name, password: PASSWORD }).expect(201);
  return logIn(email);
}
async function makeProject(s: Session, name: string, key: string) {
  const res = await request(app).post(`${org(s)}/projects`).set(as(s)).send({ name, key }).expect(201);
  return res.body.data.id as string;
}
async function makeIssue(s: Session, projectId: string, title: string, assigneeId?: string, status?: string) {
  const res = await request(app).post(`${org(s)}/projects/${projectId}/issues`).set(as(s)).send({ title }).expect(201);
  const issue = res.body.data as { id: string; version: number };
  let version = issue.version;
  if (assigneeId) {
    const r = await request(app).patch(`${org(s)}/projects/${projectId}/issues/${issue.id}`).set(as(s)).send({ version, assigneeId }).expect(200);
    version = r.body.data.version;
  }
  if (status) {
    await request(app).patch(`${org(s)}/projects/${projectId}/issues/${issue.id}`).set(as(s)).send({ version, status }).expect(200);
  }
  return issue.id;
}
const mine = (s: Session, query = "") => request(app).get(`${org(s)}/my-work/issues${query}`).set(as(s));

describe("my work: open issues assigned to me, across projects", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lists my open issues from every project, with the project's key and name, and nobody else's", async () => {
    // Why: the feature itself: one list across projects, only mine, only open, newest change first.
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const member = await addPerson(owner, "member@example.com", "member", "Mia Member");
    const web = await makeProject(owner, "Website", "WEB");
    const api = await makeProject(owner, "Backend API", "API");
    await makeIssue(owner, web, "Mine in web", owner.userId);
    await makeIssue(owner, api, "Mine in api", owner.userId);
    await makeIssue(owner, web, "Mia's", member.userId);
    await makeIssue(owner, web, "Nobody's");
    await makeIssue(owner, api, "Mine but finished", owner.userId, "done");

    const res = await mine(owner).expect(200);
    expect(res.body.total).toBe(2);
    const titles = res.body.data.map((i: { title: string }) => i.title);
    expect(titles).toEqual(["Mine in api", "Mine in web"]); // most recently changed first
    expect(res.body.data[0]).toMatchObject({ projectKey: "API", projectName: "Backend API", status: "todo", number: 1 });
    expect(res.body.data[1]).toMatchObject({ projectKey: "WEB", projectName: "Website" });

    const hers = await mine(member).expect(200);
    expect(hers.body.data.map((i: { title: string }) => i.title)).toEqual(["Mia's"]);
  });

  it("a viewer can read their own list, and a signed-out request is refused", async () => {
    // Why: no role gate (these are the caller's own issues), but authentication and membership still apply.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const viewer = await addPerson(owner, "viewer@example.com", "viewer", "Vic Viewer");
    await mine(viewer).expect(200);
    await request(app).get(`${org(owner)}/my-work/issues`).expect(401);
  });

  it("another organization's issues never appear, even for someone who belongs to both", async () => {
    // Why: tenant scoping. Issues carry only a project id, so the scope goes through the project's organization.
    // The person is a member of BOTH organizations and has an issue assigned in each, so only the organization scope
    // (not the assignee) can keep the lists apart.
    const a = await registerAndLogIn("a@example.com", "Org A", "Olivia Owner");
    const b = await registerAndLogIn("b@example.com", "Org B", "Bob Owner");
    await db.insert(organizationMembers).values({ organizationId: b.organizationId, userId: a.userId, role: "member" });
    const inA = await makeProject(a, "Plans A", "PLA");
    const inB = await makeProject(b, "Plans B", "PLB");
    await makeIssue(a, inA, "A's issue", a.userId);
    await makeIssue(b, inB, "B's issue", a.userId); // assigned to the same person, in the other organization

    const titles = async (path: string) => (await request(app).get(path).set(as(a)).expect(200)).body.data.map((i: { title: string }) => i.title);
    expect(await titles(`${org(a)}/my-work/issues`)).toEqual(["A's issue"]);
    expect(await titles(`${org(b)}/my-work/issues`)).toEqual(["B's issue"]);
    await request(app).get(`${org(b)}/my-work/issues`).set(as(b)).expect(200); // b's own list works too
  });

  it("limit caps the rows but total counts them all, and a bad limit is a 400", async () => {
    // Why: the page shows a few rows and the real count ("12 open").
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const web = await makeProject(owner, "Website", "WEB");
    for (const title of ["One", "Two", "Three"]) await makeIssue(owner, web, title, owner.userId);
    const res = await mine(owner, "?limit=2").expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(3);
    await mine(owner, "?limit=0").expect(400);
    await mine(owner, "?limit=500").expect(400);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * Finding an issue by its per-project number (ADR 0030): how a readable address such as
 * /projects/WEB/issues/WEB-12 becomes an issue. Over real HTTP and the real database; each test says what it protects.
 */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string; userId: string };

async function registerAndLogIn(email: string, organizationName: string): Promise<Session> {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: PASSWORD, name: "Owner Person", organizationName })
    .expect(201);
  return logIn(email);
}
async function logIn(email: string): Promise<Session> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return { token: res.body.accessToken, organizationId: res.body.organization.id, userId: res.body.user.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const org = (s: Session) => `/api/v1/organizations/${s.organizationId}`;

async function makeProject(s: Session, name = "Website", key = "WEB") {
  const res = await request(app).post(`${org(s)}/projects`).set(as(s)).send({ name, key }).expect(201);
  return res.body.data.id as string;
}
async function makeIssue(s: Session, projectId: string, title: string) {
  const res = await request(app).post(`${org(s)}/projects/${projectId}/issues`).set(as(s)).send({ title }).expect(201);
  return res.body.data as { id: string; number: number; title: string };
}
const byNumber = (s: Session, projectId: string, number: string | number) =>
  request(app).get(`${org(s)}/projects/${projectId}/issues/by-number/${number}`).set(as(s));

beforeEach(async () => {
  await resetDatabase();
});

describe("GET .../issues/by-number/:number", () => {
  it("returns the same issue the id read returns", async () => {
    // Why: the address resolver must hand the page exactly what the existing read would (including its id).
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    await makeIssue(owner, projectId, "First");
    const second = await makeIssue(owner, projectId, "Second");
    expect(second.number).toBe(2);

    const found = await byNumber(owner, projectId, 2).expect(200);
    const byId = await request(app).get(`${org(owner)}/projects/${projectId}/issues/${second.id}`).set(as(owner)).expect(200);
    expect(found.body).toEqual(byId.body);
    expect(found.body.data).toMatchObject({ id: second.id, number: 2, title: "Second" });
  });

  it("a deleted issue's number finds nothing and is never given to a new issue", async () => {
    // Why: an old link to WEB-2 must say "not found", never open some other issue that took the number.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    await makeIssue(owner, projectId, "One");
    const two = await makeIssue(owner, projectId, "Two");
    await request(app).delete(`${org(owner)}/projects/${projectId}/issues/${two.id}`).set(as(owner)).expect(204);

    const gone = await byNumber(owner, projectId, 2).expect(404);
    expect(gone.body.error.code).toBe("issue_not_found");
    const three = await makeIssue(owner, projectId, "Three");
    expect(three.number).toBe(3);
    await byNumber(owner, projectId, 2).expect(404);
    expect((await byNumber(owner, projectId, 3).expect(200)).body.data.title).toBe("Three");
  });

  it("is scoped to the project: the same number in two projects finds each project's own issue", async () => {
    // Why: numbers are per project, so the lookup must include the project, or WEB-1 and API-1 would collide.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const web = await makeProject(owner, "Website", "WEB");
    const api = await makeProject(owner, "Backend", "API");
    await makeIssue(owner, web, "Web one");
    await makeIssue(owner, api, "Api one");
    await makeIssue(owner, api, "Api two");

    expect((await byNumber(owner, web, 1).expect(200)).body.data.title).toBe("Web one");
    expect((await byNumber(owner, api, 1).expect(200)).body.data.title).toBe("Api one");
    await byNumber(owner, web, 2).expect(404); // only the API project has a number 2
  });

  it("does not reach another organization's issues", async () => {
    // Why: tenant isolation. Their project id in our organization is a 404, and in theirs we are not a member.
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    const bProject = await makeProject(b, "B project", "BBB");
    await makeIssue(b, bProject, "Secret");

    await byNumber(a, bProject, 1).expect(404); // asked through our own organization
    await request(app).get(`${org(b)}/projects/${bProject}/issues/by-number/1`).set(as(a)).expect(403); // through theirs
  });

  it("treats anything that is not a plain positive number as not found, never a server error", async () => {
    // Why: an address typed or mangled by hand reaches this route. 500s are for our bugs, not for input.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    await makeIssue(owner, projectId, "One");
    for (const bad of ["0", "-1", "abc", "1.5", "1e3", "99999999999999999999", "0001x", "%20"]) {
      const res = await byNumber(owner, projectId, bad);
      expect(res.status, `by-number/${bad}`).toBe(404);
    }
    // Leading zeros are still a number.
    expect((await byNumber(owner, projectId, "001").expect(200)).body.data.number).toBe(1);
  });

  it("needs a login, and a viewer may read", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    await makeIssue(owner, projectId, "One");
    await request(app).get(`${org(owner)}/projects/${projectId}/issues/by-number/1`).expect(401);

    const invited = await request(app)
      .post(`${org(owner)}/invitations`)
      .set(as(owner))
      .send({ email: "v@example.com", role: "viewer" })
      .expect(201);
    const token = new URL(invited.body.inviteUrl).searchParams.get("token")!;
    await request(app).post("/api/v1/invitations/accept").send({ token, name: "Vic Viewer", password: PASSWORD }).expect(201);
    const viewer = await logIn("v@example.com");
    await byNumber(viewer, projectId, 1).expect(200);
  });
});

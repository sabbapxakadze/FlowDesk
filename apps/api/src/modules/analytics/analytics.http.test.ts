import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";

// HTTP level, like the other *.tenant-isolation tests: proves the real
// middleware chain guards the new route, and that ?weeks= is validated
// at the boundary rather than reaching generate_series unchecked.
async function registerAndLogIn(email: string, organizationName: string) {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name: "Test User", organizationName })
    .expect(201);
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" }).expect(200);
  return { accessToken: res.body.accessToken as string, organizationId: res.body.organization.id as string };
}

async function createProject(token: string, organizationId: string, key: string) {
  const res = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: `Project ${key}`, key })
    .expect(201);
  return res.body.data.id as string;
}

describe("analytics — HTTP", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("returns exactly the requested number of zero-filled weekly points for a member", async () => {
    const a = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(a.accessToken, a.organizationId, "AAA");

    const res = await request(app)
      .get(`/api/v1/organizations/${a.organizationId}/projects/${projectId}/analytics/throughput?weeks=6`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(6);
    expect(res.body.data[0]).toEqual({ weekStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), completed: 0 });
  });

  it("defaults to 12 weeks when ?weeks= is omitted", async () => {
    const a = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(a.accessToken, a.organizationId, "AAA");

    const res = await request(app)
      .get(`/api/v1/organizations/${a.organizationId}/projects/${projectId}/analytics/throughput`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(12);
  });

  it("rejects an out-of-range ?weeks= with a 400", async () => {
    const a = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(a.accessToken, a.organizationId, "AAA");
    const url = `/api/v1/organizations/${a.organizationId}/projects/${projectId}/analytics/throughput`;

    await request(app).get(`${url}?weeks=0`).set("Authorization", `Bearer ${a.accessToken}`).expect(400);
    await request(app).get(`${url}?weeks=999`).set("Authorization", `Bearer ${a.accessToken}`).expect(400);
  });

  it("rejects a member of a different organization with a 403", async () => {
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    const projectId = await createProject(a.accessToken, a.organizationId, "AAA");

    await request(app)
      .get(`/api/v1/organizations/${a.organizationId}/projects/${projectId}/analytics/throughput`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .expect(403);
  });

  it("rejects an unauthenticated request with a 401", async () => {
    const a = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(a.accessToken, a.organizationId, "AAA");

    await request(app)
      .get(`/api/v1/organizations/${a.organizationId}/projects/${projectId}/analytics/throughput`)
      .expect(401);
  });
});

describe("analytics cycle-time — HTTP", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("returns the summary and all six buckets, with nulls, for a project with no finished issues", async () => {
    const a = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(a.accessToken, a.organizationId, "AAA");

    const res = await request(app)
      .get(`/api/v1/organizations/${a.organizationId}/projects/${projectId}/analytics/cycle-time`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.summary).toEqual({
      completed: 0,
      withoutStart: 0,
      averageDays: null,
      medianDays: null,
      p90Days: null,
    });
    expect(res.body.distribution).toHaveLength(6);
  });

  it("rejects an out-of-range ?weeks= and a non-member", async () => {
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    const projectId = await createProject(a.accessToken, a.organizationId, "AAA");
    const url = `/api/v1/organizations/${a.organizationId}/projects/${projectId}/analytics/cycle-time`;

    await request(app).get(`${url}?weeks=0`).set("Authorization", `Bearer ${a.accessToken}`).expect(400);
    await request(app).get(url).set("Authorization", `Bearer ${b.accessToken}`).expect(403);
  });
});

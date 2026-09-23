import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * HTTP-level, mirroring projects/tenant-isolation.test.ts — proves the
 * real middleware chain (requireAuth -> requireOrgMembership ->
 * requireProject -> requirePermission) on the actual nested route, one
 * link longer than the projects version since requireProject is new here.
 */
async function registerAndLogIn(email: string, organizationName: string) {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name: "Test User", organizationName })
    .expect(201);

  const loginRes = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "password123" })
    .expect(200);

  return {
    accessToken: loginRes.body.accessToken as string,
    organizationId: loginRes.body.organization.id as string,
  };
}

async function createProject(accessToken: string, organizationId: string, key: string) {
  const res = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: `Project ${key}`, key })
    .expect(201);
  return res.body.data.id as string;
}

describe("issues tenant isolation (HTTP level)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lets a member create and then list issues in their own project", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");

    const createRes = await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "First issue" })
      .expect(201);

    expect(createRes.body.data.number).toBe(1);
    expect(createRes.body.data.projectId).toBe(projectId);

    const listRes = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].title).toBe("First issue");
  });

  it("blocks a valid user from another organization from reading a project's issues", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");

    const res = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(403);

    expect(res.body.error.code).toBe("not_a_member");
  });

  it("blocks creating an issue in an organization the caller doesn't belong to", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");

    await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ title: "Intruder issue" })
      .expect(403);
  });

  it("404s for a projectId that doesn't belong to the organization in the URL", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");
    // A real project id — just not one that belongs to userA's org.
    const foreignProjectId = await createProject(userB.accessToken, userB.organizationId, "BBB");

    const res = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${foreignProjectId}/issues`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(404);

    expect(res.body.error.code).toBe("project_not_found");
  });
});

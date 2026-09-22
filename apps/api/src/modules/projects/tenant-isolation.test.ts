import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * HTTP-level, not service-level — the thing actually under test is the
 * middleware chain (requireAuth -> requireOrgMembership -> requirePermission)
 * wired together on a real route, which a service-layer test can't exercise
 * at all. Phase 1 already proved the repository query itself scopes
 * correctly; this proves the whole request pipeline does, matching how
 * rigorously everything else this session has been verified over a real
 * transport (see the Slice 2 curl-with-a-cookie-jar checks).
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

describe("tenant isolation (HTTP level)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a request with no access token at all", async () => {
    await request(app).get("/api/v1/organizations/00000000-0000-0000-0000-000000000000/projects")
      .expect(401);
  });

  it("rejects a malformed/invalid access token", async () => {
    await request(app)
      .get("/api/v1/organizations/00000000-0000-0000-0000-000000000000/projects")
      .set("Authorization", "Bearer not-a-real-token")
      .expect(401);
  });

  it("lets a member list their own organization's projects", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");

    await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it("blocks a real, valid user from another organization's projects", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");

    // userB has a perfectly valid access token — just not for Org A. The
    // URL alone is never trusted; req.ctx only exists if a real
    // membership row backs it up.
    const res = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(403);

    expect(res.body.error.code).toBe("not_a_member");
  });

  it("lets an owner create a project in their own organization", async () => {
    const userA = await registerAndLogIn("owner@example.com", "Owner Org");

    const res = await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "Website", key: "WEB" })
      .expect(201);

    expect(res.body.data.key).toBe("WEB");
    expect(res.body.data.organizationId).toBe(userA.organizationId);
  });

  it("blocks creating a project in an organization the caller doesn't belong to", async () => {
    const userA = await registerAndLogIn("a2@example.com", "Org A2");
    const userB = await registerAndLogIn("b2@example.com", "Org B2");

    await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ name: "Intruder Project", key: "HACK" })
      .expect(403);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * HTTP-level, mirroring issues.tenant-isolation.test.ts — proves the real
 * middleware chain (requireAuth -> requireOrgMembership -> requireProject
 * -> requireSprint -> requirePermission) on the actual nested sprint
 * routes, and that /backlog and /issues/:issueId/sprint (which live in
 * the issues module but touch sprints) are tenant-scoped too.
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

async function createIssue(accessToken: string, organizationId: string, projectId: string, title: string) {
  const res = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/issues`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title })
    .expect(201);
  return res.body.data as { id: string; version: number };
}

async function createSprint(accessToken: string, organizationId: string, projectId: string, name: string) {
  const res = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/sprints`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name })
    .expect(201);
  return res.body.data as { id: string; version: number };
}

describe("sprints tenant isolation (HTTP level)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lets a member create, list, start, and complete a sprint in their own project", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const sprint = await createSprint(userA.accessToken, userA.organizationId, projectId, "Sprint 1");

    const listRes = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].status).toBe("planned");

    const startRes = await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${sprint.id}/start`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: sprint.version })
      .expect(200);
    expect(startRes.body.data.status).toBe("active");

    const completeRes = await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${sprint.id}/complete`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: startRes.body.data.version })
      .expect(200);
    expect(completeRes.body.data.status).toBe("completed");
  });

  it("blocks a valid user from another organization from creating or starting a sprint", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const sprint = await createSprint(userA.accessToken, userA.organizationId, projectId, "Sprint 1");

    await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ name: "Intruder Sprint" })
      .expect(403);

    await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${sprint.id}/start`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ version: sprint.version })
      .expect(403);
  });

  it("404s starting a sprintId that doesn't belong to the project in the URL", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const otherProjectId = await createProject(userA.accessToken, userA.organizationId, "BBB");
    const sprintElsewhere = await createSprint(userA.accessToken, userA.organizationId, otherProjectId, "Elsewhere");

    const res = await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${sprintElsewhere.id}/start`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: sprintElsewhere.version })
      .expect(404);

    expect(res.body.error.code).toBe("sprint_not_found");
  });

  it("rejects starting a second sprint while one is already active, over real HTTP", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const first = await createSprint(userA.accessToken, userA.organizationId, projectId, "Sprint 1");
    const second = await createSprint(userA.accessToken, userA.organizationId, projectId, "Sprint 2");

    await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${first.id}/start`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: first.version })
      .expect(200);

    const res = await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${second.id}/start`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: second.version })
      .expect(409);

    expect(res.body.error.code).toBe("sprint_already_active");
  });

  it("assigns an issue to the active sprint and reflects it in /backlog, then moves it back to the backlog", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const sprint = await createSprint(userA.accessToken, userA.organizationId, projectId, "Sprint 1");
    await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${sprint.id}/start`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: sprint.version })
      .expect(200);
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Issue");

    const assignRes = await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/sprint`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: issue.version, sprintId: sprint.id })
      .expect(200);
    expect(assignRes.body.data.sprintId).toBe(sprint.id);

    const backlogRes = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/backlog`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(backlogRes.body.activeSprint.id).toBe(sprint.id);
    expect(backlogRes.body.activeSprintIssues).toHaveLength(1);
    expect(backlogRes.body.backlog).toHaveLength(0);

    const unassignRes = await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/sprint`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: assignRes.body.data.version, sprintId: null })
      .expect(200);
    expect(unassignRes.body.data.sprintId).toBeNull();
  });

  it("blocks a valid user from another organization from reading a project's backlog", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");

    const res = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/backlog`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(403);

    expect(res.body.error.code).toBe("not_a_member");
  });

  it("returns its issues to the backlog when the active sprint is completed, over real HTTP", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const sprint = await createSprint(userA.accessToken, userA.organizationId, projectId, "Sprint 1");
    const startRes = await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${sprint.id}/start`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: sprint.version })
      .expect(200);
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Issue");
    await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/sprint`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: issue.version, sprintId: sprint.id })
      .expect(200);

    await request(app)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/sprints/${sprint.id}/complete`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: startRes.body.data.version })
      .expect(200);

    const backlogRes = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/backlog`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(backlogRes.body.activeSprint).toBeNull();
    expect(backlogRes.body.backlog).toHaveLength(1);

    const eventsRes = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/events`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
    const removedEvent = eventsRes.body.data.find((e: { type: string }) => e.type === "issue.sprint_removed");
    expect(removedEvent.payload.reason).toBe("sprint_completed");
  });
});

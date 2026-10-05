import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * Label pills on the board and sprints cards: the board and backlog responses carry each issue's labels (id, name,
 * colour), in the same shape the issue list uses. Real Postgres, real HTTP.
 */
async function setup() {
  await request(app).post("/api/v1/auth/register").send({ email: "owner@example.com", password: "password123", name: "Owner", organizationName: "Org A" }).expect(201);
  const login = await request(app).post("/api/v1/auth/login").send({ email: "owner@example.com", password: "password123" }).expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
  const orgBase = `/api/v1/organizations/${login.body.organization.id as string}`;
  const project = await request(app).post(`${orgBase}/projects`).set(auth).send({ name: "Project", key: "AAA" }).expect(201);
  const base = `${orgBase}/projects/${project.body.data.id as string}`;
  const issue = async (title: string) => (await request(app).post(`${base}/issues`).set(auth).send({ title }).expect(201)).body.data.id as string;
  const label = async (name: string) => (await request(app).post(`${orgBase}/labels`).set(auth).send({ name, color: "#b91c1c" }).expect(201)).body.data.id as string;
  const attach = (issueId: string, labelId: string) => request(app).post(`${base}/issues/${issueId}/labels`).set(auth).send({ labelId }).expect(201);
  return { base, auth, issue, label, attach };
}

describe("labels on the board and the backlog (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("the board returns each issue's labels (an empty list when it has none)", async () => {
    // Catches: a card with no pills because the board response never carried labels, or null instead of [] for an unlabeled issue.
    const { base, auth, issue, label, attach } = await setup();
    const tagged = await issue("Tagged");
    const plain = await issue("Plain");
    await attach(tagged, await label("bug"));
    await attach(tagged, await label("design"));

    const res = await request(app).get(`${base}/board`).set(auth).expect(200);
    const byTitle = Object.fromEntries(res.body.data.map((i: { title: string }) => [i.title, i]));
    expect(byTitle["Tagged"].labels.map((l: { name: string }) => l.name)).toEqual(["bug", "design"]);
    expect(byTitle["Tagged"].labels[0]).toEqual({ id: expect.any(String), name: "bug", color: "#b91c1c" });
    expect(byTitle["Plain"].labels).toEqual([]);
    void plain;
  });

  it("the backlog returns labels for the backlog and for the active sprint's issues", async () => {
    // Catches: pills missing on the sprints page (one of its two lists forgetting the labels).
    const { base, auth, issue, label, attach } = await setup();
    const inBacklog = await issue("In backlog");
    const inSprint = await issue("In sprint");
    const bug = await label("bug");
    await attach(inBacklog, bug);
    await attach(inSprint, bug);
    const sprint = await request(app).post(`${base}/sprints`).set(auth).send({ name: "Sprint 1" }).expect(201);
    const sprintId = sprint.body.data.id as string;
    const fetched = await request(app).get(`${base}/issues/${inSprint}`).set(auth).expect(200);
    await request(app).patch(`${base}/issues/${inSprint}/sprint`).set(auth).send({ version: fetched.body.data.version, sprintId }).expect(200);
    await request(app).patch(`${base}/sprints/${sprintId}/start`).set(auth).send({ version: sprint.body.data.version }).expect(200);

    const res = await request(app).get(`${base}/backlog`).set(auth).expect(200);
    expect(res.body.backlog.map((i: { labels: { name: string }[] }) => i.labels.map((l) => l.name))).toEqual([["bug"]]);
    expect(res.body.activeSprintIssues.map((i: { labels: { name: string }[] }) => i.labels.map((l) => l.name))).toEqual([["bug"]]);
  });
});

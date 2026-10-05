import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * Labels in the issue list: every item carries its labels, and `?label=` (repeated) keeps only the issues that have ALL
 * the chosen labels. Over real HTTP and the real database; each test says what it protects.
 */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string };

async function registerAndLogIn(email: string, organizationName: string): Promise<Session> {
  await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name: "Owner Person", organizationName }).expect(201);
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return { token: res.body.accessToken, organizationId: res.body.organization.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const org = (s: Session) => `/api/v1/organizations/${s.organizationId}`;

async function setup() {
  const owner = await registerAndLogIn("owner@example.com", "Org A");
  const project = await request(app).post(`${org(owner)}/projects`).set(as(owner)).send({ name: "Website", key: "WEB" }).expect(201);
  const projectId = project.body.data.id as string;
  const issue = async (title: string) =>
    (await request(app).post(`${org(owner)}/projects/${projectId}/issues`).set(as(owner)).send({ title }).expect(201)).body.data.id as string;
  const label = async (name: string, color: string) =>
    (await request(app).post(`${org(owner)}/labels`).set(as(owner)).send({ name, color }).expect(201)).body.data.id as string;
  const attach = (issueId: string, labelId: string) =>
    request(app).post(`${org(owner)}/projects/${projectId}/issues/${issueId}/labels`).set(as(owner)).send({ labelId }).expect(201);
  const list = (query = "") => request(app).get(`${org(owner)}/projects/${projectId}/issues${query}`).set(as(owner));
  return { owner, projectId, issue, label, attach, list };
}
const titles = (res: request.Response) => res.body.data.map((i: { title: string }) => i.title);

describe("issue list: labels", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("each item carries its own labels (id, name, colour), by name; an issue without labels has an empty list", async () => {
    // Why: the cards draw pills from this, so a wrong or missing list would show on every card.
    const { issue, label, attach, list } = await setup();
    const bug = await label("bug", "#b91c1c");
    const design = await label("design", "#6d28d9");
    const a = await issue("Has both");
    const b = await issue("Has bug only");
    await issue("Has none");
    await attach(a, design); // attached before bug on purpose: the list is by name, not by attach order
    await attach(a, bug);
    await attach(b, bug);

    const res = await list().expect(200);
    const byTitle = Object.fromEntries(res.body.data.map((i: { title: string; labels: unknown[] }) => [i.title, i.labels]));
    expect(byTitle["Has both"]).toEqual([
      { id: bug, name: "bug", color: "#b91c1c" },
      { id: design, name: "design", color: "#6d28d9" },
    ]);
    expect(byTitle["Has bug only"]).toEqual([{ id: bug, name: "bug", color: "#b91c1c" }]);
    expect(byTitle["Has none"]).toEqual([]);
  });

  it("one label keeps the issues that have it; several labels keep only the issues that have ALL of them", async () => {
    // Why: the filter's meaning. Choosing a second label narrows the list (the owner chose "all of them").
    const { issue, label, attach, list } = await setup();
    const bug = await label("bug", "#b91c1c");
    const design = await label("design", "#6d28d9");
    const docs = await label("docs", "#15803d");
    const both = await issue("Bug and design");
    const onlyBug = await issue("Only bug");
    const onlyDesign = await issue("Only design");
    await issue("Nothing");
    await attach(both, bug);
    await attach(both, design);
    await attach(onlyBug, bug);
    await attach(onlyDesign, design);

    expect(titles(await list(`?label=${bug}`).expect(200)).sort()).toEqual(["Bug and design", "Only bug"]);
    expect(titles(await list(`?label=${bug}&label=${design}`).expect(200))).toEqual(["Bug and design"]);
    expect(titles(await list(`?label=${docs}`).expect(200))).toEqual([]); // a label nobody has
    expect(titles(await list(`?label=${bug}&label=${docs}`).expect(200))).toEqual([]); // all of them, so none
    // The same label twice is the same as once.
    expect(titles(await list(`?label=${bug}&label=${bug}`).expect(200)).sort()).toEqual(["Bug and design", "Only bug"]);
  });

  it("it combines with the other filters and keeps paging exact", async () => {
    // Why: the label condition sits in the same query as status, priority, the cursor and the sort.
    const { issue, label, attach, list } = await setup();
    const bug = await label("bug", "#b91c1c");
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const id = await issue(`Issue ${i}`);
      ids.push(id);
      if (i !== 3) await attach(id, bug);
    }
    const seen: string[] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const res = await list(`?label=${bug}&limit=2${cursor}`).expect(200);
      seen.push(...titles(res));
      if (!res.body.nextCursor) break;
      cursor = `&cursor=${res.body.nextCursor}`;
    }
    expect(seen).toEqual(["Issue 5", "Issue 4", "Issue 2", "Issue 1"]); // newest first, Issue 3 has no label, nothing repeated
    expect(titles(await list(`?label=${bug}&status=done`).expect(200))).toEqual([]);
    expect(titles(await list(`?label=${bug}&order=asc&limit=1`).expect(200))).toEqual(["Issue 1"]);
  });

  it("a bad label id, or more than ten labels, is a 400; an unknown or foreign label id just matches nothing", async () => {
    // Why: input is checked; and another organization's label id cannot be used to see anything.
    const { owner, issue, list } = await setup();
    await issue("Anything");
    await list("?label=not-a-uuid").expect(400);
    const eleven = Array.from({ length: 11 }, () => "11111111-1111-4111-8111-111111111111");
    await list(`?${eleven.map((id) => `label=${id}`).join("&")}`).expect(400);

    const other = await registerAndLogIn("other@example.com", "Org B");
    const foreign = (await request(app).post(`${org(other)}/labels`).set(as(other)).send({ name: "theirs", color: "#000000" }).expect(201)).body.data.id as string;
    expect(titles(await list(`?label=${foreign}`).expect(200))).toEqual([]);
    expect(owner.organizationId).not.toBe(other.organizationId);
  });
});

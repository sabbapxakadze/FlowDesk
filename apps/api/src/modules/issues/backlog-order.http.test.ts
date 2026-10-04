import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { issueEvents, issues, notifications } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * The order of the sprints-page lists (ADR 0008, amended): backlog_rank, one per issue for whichever list
 * it is in (the backlog or one sprint), with the board's ranking scheme. Over real HTTP and the real
 * database. Each test says what it protects.
 */

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

async function addPerson(owner: Session, email: string, name: string) {
  const invited = await request(app).post(`${org(owner)}/invitations`).set(as(owner)).send({ email, role: "member" }).expect(201);
  const token = new URL(invited.body.inviteUrl).searchParams.get("token")!;
  await request(app).post("/api/v1/invitations/accept").send({ token, name, password: PASSWORD }).expect(201);
  return logIn(email);
}

async function makeProject(s: Session, name = "Website", key = "WEB") {
  const res = await request(app).post(`${org(s)}/projects`).set(as(s)).send({ name, key }).expect(201);
  return res.body.data.id as string;
}

/** Creates issues one after another; the LAST created is first in the backlog (new issues go on top). */
async function makeIssues(s: Session, projectId: string, titles: string[]) {
  const ids: Record<string, string> = {};
  for (const title of titles) {
    const res = await request(app).post(`${org(s)}/projects/${projectId}/issues`).set(as(s)).send({ title }).expect(201);
    ids[title] = res.body.data.id as string;
  }
  return ids;
}

async function makeSprint(s: Session, projectId: string, name: string) {
  const res = await request(app).post(`${org(s)}/projects/${projectId}/sprints`).set(as(s)).send({ name }).expect(201);
  return res.body.data as { id: string; version: number };
}
async function startSprint(s: Session, projectId: string, sprint: { id: string; version: number }) {
  const res = await request(app).patch(`${org(s)}/projects/${projectId}/sprints/${sprint.id}/start`).set(as(s)).send({ version: sprint.version }).expect(200);
  return res.body.data as { id: string; version: number };
}

const titlesOf = (list: { title: string }[]) => list.map((i) => i.title);
async function lists(s: Session, projectId: string) {
  const res = await request(app).get(`${org(s)}/projects/${projectId}/backlog`).set(as(s)).expect(200);
  return {
    backlog: titlesOf(res.body.backlog),
    sprint: titlesOf(res.body.activeSprintIssues),
  };
}

/** Moves (or reorders) an issue: sprintId null = the backlog. */
async function place(
  s: Session,
  projectId: string,
  issueId: string,
  body: { sprintId: string | null; prevIssueId?: string; nextIssueId?: string },
) {
  const current = await db.select({ version: issues.version }).from(issues).where(eq(issues.id, issueId));
  return request(app)
    .patch(`${org(s)}/projects/${projectId}/issues/${issueId}/sprint`)
    .set(as(s))
    .send({ version: current[0]!.version, ...body });
}

beforeEach(async () => {
  await resetDatabase();
});

describe("a new issue and the backlog's order", () => {
  it("a new issue is first in the backlog, above the ones created earlier", async () => {
    // Why: the owner's rule. Each new issue takes the top, so the backlog reads newest first until it is reordered.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    await makeIssues(owner, projectId, ["First", "Second", "Third"]);
    expect((await lists(owner, projectId)).backlog).toEqual(["Third", "Second", "First"]);
  });

  it("drag up and down inside the backlog: before a neighbour, between two, and to the end", async () => {
    // Why: the feature. Reordering inside a list uses the neighbours the same way the board's move does.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const id = await makeIssues(owner, projectId, ["D", "C", "B", "A"]); // backlog: A B C D
    expect((await lists(owner, projectId)).backlog).toEqual(["A", "B", "C", "D"]);

    // D to the top (before A, no lower bound).
    await place(owner, projectId, id.D!, { sprintId: null, nextIssueId: id.A! }).then((r) => expect(r.status).toBe(200));
    expect((await lists(owner, projectId)).backlog).toEqual(["D", "A", "B", "C"]);
    // A between B and C.
    await place(owner, projectId, id.A!, { sprintId: null, prevIssueId: id.B!, nextIssueId: id.C! }).then((r) => expect(r.status).toBe(200));
    expect((await lists(owner, projectId)).backlog).toEqual(["D", "B", "A", "C"]);
    // D to the end (no neighbours).
    await place(owner, projectId, id.D!, { sprintId: null }).then((r) => expect(r.status).toBe(200));
    expect((await lists(owner, projectId)).backlog).toEqual(["B", "A", "C", "D"]);
  });

  it("the active sprint is ordered the same way, independently of the backlog", async () => {
    // Why: both lists are reorderable (owner's choice); their ranks must not disturb each other.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const id = await makeIssues(owner, projectId, ["D", "C", "B", "A"]);
    const sprint = await startSprint(owner, projectId, await makeSprint(owner, projectId, "Sprint 1"));
    // Into the sprint, one after another at the end: B, C, D.
    for (const t of ["B", "C", "D"]) await place(owner, projectId, id[t]!, { sprintId: sprint.id }).then((r) => expect(r.status).toBe(200));
    let now = await lists(owner, projectId);
    expect(now.sprint).toEqual(["B", "C", "D"]);
    expect(now.backlog).toEqual(["A"]);

    await place(owner, projectId, id.D!, { sprintId: sprint.id, nextIssueId: id.B! }).then((r) => expect(r.status).toBe(200));
    now = await lists(owner, projectId);
    expect(now.sprint).toEqual(["D", "B", "C"]);
    expect(now.backlog).toEqual(["A"]);
  });

  it("dropping from one list into a chosen place in the other lands exactly there", async () => {
    // Why: a drag between lists carries its position, in one request.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const id = await makeIssues(owner, projectId, ["E", "D", "C", "B", "A"]); // backlog A B C D E
    const sprint = await startSprint(owner, projectId, await makeSprint(owner, projectId, "Sprint 1"));
    await place(owner, projectId, id.A!, { sprintId: sprint.id });
    await place(owner, projectId, id.B!, { sprintId: sprint.id });
    // Sprint: A B. Backlog: C D E. Drop E between A and B in the sprint.
    const res = await place(owner, projectId, id.E!, { sprintId: sprint.id, prevIssueId: id.A!, nextIssueId: id.B! });
    expect(res.status).toBe(200);
    expect(res.body.data.sprintId).toBe(sprint.id);
    const now = await lists(owner, projectId);
    expect(now.sprint).toEqual(["A", "E", "B"]);
    expect(now.backlog).toEqual(["C", "D"]);
  });

  it("many drops into the same gap keep the order (the gap is renumbered when it runs out)", async () => {
    // Why: each drop between two neighbours halves the gap; after enough of them the board's rebalance must
    // run for this list too, with the order unchanged. Each mover goes just above Last, after the previous one.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const id = await makeIssues(owner, projectId, ["Last", "First"]); // backlog: First, Last
    const names = Array.from({ length: 16 }, (_, i) => `m${String(i + 1).padStart(2, "0")}`);
    const movers = await makeIssues(owner, projectId, names); // each new issue goes on top
    let previous = id.First!;
    for (const name of names) {
      await place(owner, projectId, movers[name]!, { sprintId: null, prevIssueId: previous, nextIssueId: id.Last! }).then((r) => expect(r.status).toBe(200));
      previous = movers[name]!;
    }
    expect((await lists(owner, projectId)).backlog).toEqual(["First", ...names, "Last"]);
    // 16 halvings of a 1000 gap need more decimals than the limit, so a rebalance happened: every rank is an
    // integer again or has few decimals, and all of them are distinct.
    const ranks = (await db.select({ r: issues.backlogRank }).from(issues).where(eq(issues.projectId, projectId))).map((x) => x.r);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(Math.max(...ranks.map((r) => (r.split(".")[1] ?? "").length))).toBeLessThanOrEqual(10);
  });
});

describe("what a neighbour must be", () => {
  it("a neighbour from the wrong list, the issue itself, another project or another organization is refused and changes nothing", async () => {
    // Why: positions are only valid inside the target list; this is the tenant and list guard.
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    const projectId = await makeProject(a);
    const otherProject = await makeProject(a, "Other", "OTH");
    const id = await makeIssues(a, projectId, ["Two", "One"]);
    const elsewhere = await makeIssues(a, otherProject, ["Elsewhere"]);
    const foreign = await makeIssues(b, await makeProject(b, "B project", "BBB"), ["Foreign"]);
    const sprint = await startSprint(a, projectId, await makeSprint(a, projectId, "Sprint 1"));
    await place(a, projectId, id.Two!, { sprintId: sprint.id }); // Two is in the sprint, One in the backlog

    const refused = [
      place(a, projectId, id.One!, { sprintId: null, nextIssueId: id.Two! }), // Two is in the sprint, not the backlog
      place(a, projectId, id.One!, { sprintId: null, nextIssueId: id.One! }), // itself
      place(a, projectId, id.One!, { sprintId: null, nextIssueId: elsewhere.Elsewhere! }), // another project
      place(a, projectId, id.One!, { sprintId: null, nextIssueId: foreign.Foreign! }), // another organization
      place(a, projectId, id.One!, { sprintId: null, prevIssueId: id.Two!, nextIssueId: id.One! }),
    ];
    for (const result of await Promise.all(refused)) {
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("invalid_neighbor");
    }
    expect((await lists(a, projectId)).backlog).toEqual(["One"]);
  });

  it("a stale version is a 409 with the current issue, and nothing moves", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const id = await makeIssues(owner, projectId, ["B", "A"]);
    const res = await request(app)
      .patch(`${org(owner)}/projects/${projectId}/issues/${id.B!}/sprint`)
      .set(as(owner))
      .send({ version: 99, sprintId: null, nextIssueId: id.A! });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("version_conflict");
    expect((await lists(owner, projectId)).backlog).toEqual(["A", "B"]);
  });
});

describe("events and notifications", () => {
  it("a reorder inside one list writes issue.reordered and notifies nobody; a move between lists still notifies", async () => {
    // Why: backlog grooming must not spam participants (like comment edits), but a real assignment keeps its notification.
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const member = await addPerson(owner, "m@example.com", "Max Member");
    const projectId = await makeProject(owner);
    const id = await makeIssues(owner, projectId, ["B", "A"]);
    // The member comments, so they are a participant who WOULD be notified.
    await request(app).post(`${org(owner)}/projects/${projectId}/issues/${id.A!}/comments`).set(as(member)).send({ body: "hi" }).expect(201);
    await db.delete(notifications);

    await place(owner, projectId, id.A!, { sprintId: null, nextIssueId: id.B! }).then((r) => expect(r.status).toBe(200));
    const reordered = await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.reordered"));
    expect(reordered).toHaveLength(1);
    expect(reordered[0]).toMatchObject({ issueId: id.A!, actorId: owner.userId });
    expect(await db.select().from(notifications)).toHaveLength(0);

    const sprint = await startSprint(owner, projectId, await makeSprint(owner, projectId, "Sprint 1"));
    await place(owner, projectId, id.A!, { sprintId: sprint.id }).then((r) => expect(r.status).toBe(200));
    const assigned = await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.sprint_assigned"));
    expect(assigned).toHaveLength(1);
    expect((await db.select().from(notifications)).map((n) => n.userId)).toEqual([member.userId]);
  });
});

describe("completing a sprint", () => {
  it("puts its open issues at the top of the backlog, keeping the order they had in the sprint", async () => {
    // Why: released issues must not land in the middle of the backlog by accident of their old rank.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const id = await makeIssues(owner, projectId, ["Z", "Y", "S3", "S2", "S1"]); // backlog: S1 S2 S3 Y Z
    const sprint = await startSprint(owner, projectId, await makeSprint(owner, projectId, "Sprint 1"));
    // Sprint order: S3, S1, S2 (deliberately not their backlog order).
    for (const t of ["S3", "S1", "S2"]) await place(owner, projectId, id[t]!, { sprintId: sprint.id });
    expect((await lists(owner, projectId)).sprint).toEqual(["S3", "S1", "S2"]);
    expect((await lists(owner, projectId)).backlog).toEqual(["Y", "Z"]);

    const sprintNow = await request(app).get(`${org(owner)}/projects/${projectId}/sprints`).set(as(owner)).expect(200);
    await request(app)
      .patch(`${org(owner)}/projects/${projectId}/sprints/${sprint.id}/complete`)
      .set(as(owner))
      .send({ version: sprintNow.body.data[0].version })
      .expect(200);
    expect((await lists(owner, projectId)).backlog).toEqual(["S3", "S1", "S2", "Y", "Z"]);
  });

  it("with an empty backlog the released issues still come out in order", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const id = await makeIssues(owner, projectId, ["B", "A"]);
    const sprint = await startSprint(owner, projectId, await makeSprint(owner, projectId, "Sprint 1"));
    for (const t of ["B", "A"]) await place(owner, projectId, id[t]!, { sprintId: sprint.id });
    const sprintNow = await request(app).get(`${org(owner)}/projects/${projectId}/sprints`).set(as(owner)).expect(200);
    await request(app)
      .patch(`${org(owner)}/projects/${projectId}/sprints/${sprint.id}/complete`)
      .set(as(owner))
      .send({ version: sprintNow.body.data[0].version })
      .expect(200);
    expect((await lists(owner, projectId)).backlog).toEqual(["B", "A"]);
  });
});

describe("the Sprints list and the migration's backfill", () => {
  it("lists sprints newest first", async () => {
    // Why: the owner wants the latest sprint at the top of the page's Sprints list.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    for (const name of ["Sprint 1", "Sprint 2", "Sprint 3"]) await makeSprint(owner, projectId, name);
    const res = await request(app).get(`${org(owner)}/projects/${projectId}/sprints`).set(as(owner)).expect(200);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["Sprint 3", "Sprint 2", "Sprint 1"]);
  });
});

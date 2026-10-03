import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { auditEvents, projects } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * The organization audit log (ADR 0027), over real HTTP and the real database. Each test says
 * what it protects. Rows are read through the API where that is the point (permissions,
 * paging, what a person would see) and straight from the table where the exact stored values
 * are the point.
 */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string; userId: string };

async function registerAndLogIn(email: string, organizationName: string, name = "Owner Person"): Promise<Session> {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: PASSWORD, name, organizationName })
    .expect(201);
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

async function rows(s: Session) {
  return db.select().from(auditEvents).where(eq(auditEvents.organizationId, s.organizationId)).orderBy(auditEvents.createdAt);
}
const actionsOf = async (s: Session) => (await rows(s)).map((r) => r.action);

async function makeProject(s: Session, name = "Website", key = "WEB") {
  const res = await request(app).post(`${org(s)}/projects`).set(as(s)).send({ name, key }).expect(201);
  return res.body.data.id as string;
}

describe("audit log: every action writes exactly one row", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("project created, renamed and deleted, with names kept after the project is gone", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const projectId = await makeProject(owner, "Website", "WEB");
    await request(app).patch(`${org(owner)}/projects/${projectId}`).set(as(owner)).send({ name: "Marketing site" }).expect(200);
    // The same name again changes nothing, so it records nothing.
    await request(app).patch(`${org(owner)}/projects/${projectId}`).set(as(owner)).send({ name: "Marketing site" }).expect(200);
    // Two issues, so the deletion row can say what was lost.
    for (const title of ["One", "Two"]) {
      await request(app).post(`${org(owner)}/projects/${projectId}/issues`).set(as(owner)).send({ title }).expect(201);
    }
    await request(app)
      .delete(`${org(owner)}/projects/${projectId}`)
      .set(as(owner))
      .send({ confirmName: "Marketing site" })
      .expect(204);

    const log = await rows(owner);
    expect(log.map((r) => r.action)).toEqual(["project.created", "project.renamed", "project.deleted"]);
    expect(log[0]).toMatchObject({ actorName: "Olivia Owner", actorId: owner.userId, targetType: "project", targetLabel: "Website", details: { key: "WEB" } });
    expect(log[1]).toMatchObject({ targetLabel: "Marketing site", details: { from: "Website", to: "Marketing site" } });
    expect(log[2]).toMatchObject({ targetLabel: "Marketing site", details: { key: "WEB", issueCount: 2 } });
    // The project is gone; the log still reads in full.
    expect(await db.select().from(projects).where(eq(projects.id, projectId))).toHaveLength(0);
  });

  it("label updated (only the fields that changed) and deleted (with how many issues had it); creating one is not logged", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const issue = await request(app).post(`${org(owner)}/projects/${projectId}/issues`).set(as(owner)).send({ title: "Has the label" }).expect(201);
    const label = await request(app).post(`${org(owner)}/labels`).set(as(owner)).send({ name: "bug", color: "#FF0000" }).expect(201);
    const labelId = label.body.data.id as string;
    await request(app).post(`${org(owner)}/projects/${projectId}/issues/${issue.body.data.id}/labels`).set(as(owner)).send({ labelId }).expect(201);

    await request(app).patch(`${org(owner)}/labels/${labelId}`).set(as(owner)).send({ color: "#00FF00" }).expect(200);
    await request(app).patch(`${org(owner)}/labels/${labelId}`).set(as(owner)).send({ name: "defect", color: "#00FF00" }).expect(200);
    await request(app).delete(`${org(owner)}/labels/${labelId}`).set(as(owner)).expect(204);

    const log = (await rows(owner)).filter((r) => r.targetType === "label");
    expect(log.map((r) => r.action)).toEqual(["label.updated", "label.updated", "label.deleted"]);
    expect(log[0]?.details).toEqual({ color: { from: "#FF0000", to: "#00FF00" } }); // name did not change, so it is absent
    expect(log[1]?.details).toEqual({ name: { from: "bug", to: "defect" } }); // colour was resent unchanged
    expect(log[2]).toMatchObject({ targetLabel: "defect", details: { color: "#00FF00", usedOnIssues: 1 } });
  });

  it("sprint renamed, started, completed and deleted, each with its project's name", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner, "Website", "WEB");
    const base = `${org(owner)}/projects/${projectId}/sprints`;
    const made = await request(app).post(base).set(as(owner)).send({ name: "Sprint 1" }).expect(201);
    const sprintId = made.body.data.id as string;

    const renamed = await request(app).patch(`${base}/${sprintId}`).set(as(owner)).send({ version: made.body.data.version, name: "Launch sprint" }).expect(200);
    const started = await request(app).patch(`${base}/${sprintId}/start`).set(as(owner)).send({ version: renamed.body.data.version }).expect(200);
    await request(app).patch(`${base}/${sprintId}/complete`).set(as(owner)).send({ version: started.body.data.version }).expect(200);
    await request(app).delete(`${base}/${sprintId}`).set(as(owner)).expect(204);

    const log = (await rows(owner)).filter((r) => r.targetType === "sprint");
    expect(log.map((r) => r.action)).toEqual(["sprint.renamed", "sprint.started", "sprint.completed", "sprint.deleted"]);
    expect(log[0]?.details).toEqual({ from: "Sprint 1", to: "Launch sprint", projectName: "Website" });
    expect(log[1]).toMatchObject({ targetLabel: "Launch sprint", details: { projectName: "Website" } });
    expect(log[2]?.details).toEqual({ releasedIssues: 0, projectName: "Website" });
    expect(log[3]).toMatchObject({ targetLabel: "Launch sprint", details: { status: "completed", projectName: "Website" } });
  });

  it("issue deleted keeps its key, title and project; an ordinary edit is not logged", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner, "Website", "WEB");
    const issue = await request(app).post(`${org(owner)}/projects/${projectId}/issues`).set(as(owner)).send({ title: "Fix login redirect" }).expect(201);
    const path = `${org(owner)}/projects/${projectId}/issues/${issue.body.data.id}`;
    await request(app).patch(path).set(as(owner)).send({ version: issue.body.data.version, title: "Fix the login redirect" }).expect(200);
    await request(app).delete(path).set(as(owner)).expect(204);

    const log = (await rows(owner)).filter((r) => r.targetType === "issue");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: "issue.deleted",
      targetLabel: "WEB-1 Fix the login redirect",
      details: { status: "todo", projectName: "Website", attachments: 0 },
    });
  });

  it("member invited, re-sent, revoked, joined, role changed and removed, in order, each by the right person", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const first = await request(app).post(`${org(owner)}/invitations`).set(as(owner)).send({ email: "a@example.com", role: "member" }).expect(201);
    const resent = await request(app).post(`${org(owner)}/invitations/${first.body.data.id}/resend`).set(as(owner)).expect(201);
    await request(app).delete(`${org(owner)}/invitations/${resent.body.data.id}`).set(as(owner)).expect(204);

    const joiner = await addPerson(owner, "b@example.com", "member", "Ben Joiner");
    await request(app).patch(`${org(owner)}/members/${joiner.userId}`).set(as(owner)).send({ role: "admin" }).expect(204);
    await request(app).patch(`${org(owner)}/members/${joiner.userId}`).set(as(owner)).send({ role: "admin" }).expect(204); // no change: no row
    await request(app).delete(`${org(owner)}/members/${joiner.userId}`).set(as(owner)).expect(204);

    const log = await rows(owner);
    expect(log.map((r) => r.action)).toEqual([
      "member.invited", // a@
      "invitation.resent",
      "invitation.revoked",
      "member.invited", // b@
      "member.joined",
      "member.role_changed",
      "member.removed",
    ]);
    expect(log[0]).toMatchObject({ targetLabel: "a@example.com", actorName: "Olivia Owner", details: { role: "member" } });
    expect(log[4]).toMatchObject({ actorName: "Ben Joiner", actorId: joiner.userId, targetLabel: "Ben Joiner", details: { email: "b@example.com", role: "member" } });
    expect(log[5]).toMatchObject({ actorName: "Olivia Owner", targetLabel: "Ben Joiner", details: { email: "b@example.com", from: "member", to: "admin" } });
    expect(log[6]).toMatchObject({ targetLabel: "Ben Joiner", details: { email: "b@example.com", role: "admin", unassignedIssues: 0 } });
  });

  it("a returning member (invited back after removal) is logged as joined too", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member", "Mia Member");
    await request(app).delete(`${org(owner)}/members/${member.userId}`).set(as(owner)).expect(204);
    const again = await request(app).post(`${org(owner)}/invitations`).set(as(owner)).send({ email: "m@example.com", role: "viewer" }).expect(201);
    await request(app)
      .post("/api/v1/invitations/accept")
      .send({ token: new URL(again.body.inviteUrl).searchParams.get("token")! })
      .expect(201);
    const joined = (await rows(owner)).filter((r) => r.action === "member.joined");
    expect(joined).toHaveLength(2);
    expect(joined[1]?.details).toMatchObject({ role: "viewer", returning: true });
  });
});

describe("audit log: the log is trustworthy", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("an action and its row are one unit: if the row cannot be written, the action does not happen", async () => {
    // Why: that is what 'written in the same transaction' buys. A trigger makes every insert into
    // audit_events fail; renaming must then fail AND leave the old name in place.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner, "Website", "WEB");
    await db.execute(sql`CREATE FUNCTION audit_test_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit insert refused'; END; $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER audit_test_fail BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_test_fail()`);
    try {
      const res = await request(app).patch(`${org(owner)}/projects/${projectId}`).set(as(owner)).send({ name: "Renamed" });
      expect(res.status).toBe(500);
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      expect(project?.name).toBe("Website"); // the rename rolled back
    } finally {
      await db.execute(sql`DROP TRIGGER audit_test_fail ON audit_events`);
      await db.execute(sql`DROP FUNCTION audit_test_fail()`);
    }
    // And with the trigger gone the same call works and is logged.
    await request(app).patch(`${org(owner)}/projects/${projectId}`).set(as(owner)).send({ name: "Renamed" }).expect(200);
    expect(await actionsOf(owner)).toContain("project.renamed");
  });

  it("the other way round: if the action fails after its row was written, the row is rolled back too", async () => {
    // Why: project.deleted is written BEFORE the delete runs (the project is gone a statement
    // later). A trigger makes the DELETE fail; the row written a moment earlier must vanish with
    // it, or the log would say a project was deleted that still exists.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner, "Website", "WEB");
    await db.execute(sql`CREATE FUNCTION audit_test_block_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'delete refused'; END; $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER audit_test_block_delete BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION audit_test_block_delete()`);
    try {
      const res = await request(app).delete(`${org(owner)}/projects/${projectId}`).set(as(owner)).send({ confirmName: "Website" });
      expect(res.status).toBe(500);
      expect(await db.select().from(projects).where(eq(projects.id, projectId))).toHaveLength(1);
      expect(await actionsOf(owner)).not.toContain("project.deleted");
    } finally {
      await db.execute(sql`DROP TRIGGER audit_test_block_delete ON projects`);
      await db.execute(sql`DROP FUNCTION audit_test_block_delete()`);
    }
  });

  it("a failed or refused action leaves no row", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member", "Mia Member");
    const projectId = await makeProject(owner);
    const before = (await rows(owner)).length;

    // A member may not rename a project (403), a wrong confirmation does not delete (400).
    await request(app).patch(`${org(owner)}/projects/${projectId}`).set(as(member)).send({ name: "Nope" }).expect(403);
    await request(app).delete(`${org(owner)}/projects/${projectId}`).set(as(owner)).send({ confirmName: "wrong" }).expect(400);
    await request(app).patch(`${org(owner)}/members/${owner.userId}`).set(as(owner)).send({ role: "member" }).expect(403); // owner protected
    expect((await rows(owner)).length).toBe(before);
  });
});

describe("audit log: reading it", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("owners and admins can read it; members and viewers get 403", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const admin = await addPerson(owner, "admin@example.com", "admin", "Ada Admin");
    const member = await addPerson(owner, "m@example.com", "member", "Mia Member");
    const viewer = await addPerson(owner, "v@example.com", "viewer", "Vic Viewer");
    for (const s of [owner, admin]) await request(app).get(`${org(owner)}/audit-events`).set(as(s)).expect(200);
    for (const s of [member, viewer]) await request(app).get(`${org(owner)}/audit-events`).set(as(s)).expect(403);
  });

  it("another organization never sees this log, and cannot read it by using this organization's id", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await makeProject(owner, "Secret project", "SEC");
    const other = await registerAndLogIn("other@example.com", "Org B");
    await makeProject(other, "Their project", "THR");

    await request(app).get(`${org(owner)}/audit-events`).set(as(other)).expect(403); // not a member of A
    const theirs = await request(app).get(`${org(other)}/audit-events`).set(as(other)).expect(200);
    expect(JSON.stringify(theirs.body)).not.toContain("Secret project");
    expect(theirs.body.data.map((e: { targetLabel: string }) => e.targetLabel)).toEqual(["Their project"]);
  });

  it("newest first, paged by cursor with nothing skipped or repeated, filterable by person and by kind", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const admin = await addPerson(owner, "admin@example.com", "admin", "Ada Admin");
    for (let i = 0; i < 7; i++) await makeProject(owner, `Project ${i}`, `P${i}X`);
    await makeProject(admin, "By admin", "ADM");
    // Spread the stored times out so 'newest first' has one right answer.
    await db.execute(sql`UPDATE audit_events SET created_at = now() - (random() * interval '1 day') WHERE organization_id = ${owner.organizationId}`);
    const all = await rows(owner);
    const expectedIds = [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)).map((r) => r.id);

    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await request(app)
        .get(`${org(owner)}/audit-events?limit=4${cursor ? `&cursor=${cursor}` : ""}`)
        .set(as(owner))
        .expect(200);
      ids.push(...res.body.data.map((e: { id: string }) => e.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 20);
    expect(pages).toBeGreaterThan(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expectedIds);

    const byAdmin = await request(app).get(`${org(owner)}/audit-events?actor=${admin.userId}`).set(as(owner)).expect(200);
    expect(byAdmin.body.data.every((e: { actorId: string }) => e.actorId === admin.userId)).toBe(true);
    expect(byAdmin.body.data.map((e: { targetLabel: string }) => e.targetLabel)).toContain("By admin");

    const projectsOnly = await request(app).get(`${org(owner)}/audit-events?kind=project&limit=100`).set(as(owner)).expect(200);
    expect(projectsOnly.body.data.every((e: { targetType: string }) => e.targetType === "project")).toBe(true);
    const membersOnly = await request(app).get(`${org(owner)}/audit-events?kind=member&limit=100`).set(as(owner)).expect(200);
    expect(membersOnly.body.data.every((e: { targetType: string }) => e.targetType === "member")).toBe(true);
    expect(membersOnly.body.data.length).toBeGreaterThan(0);

    await request(app).get(`${org(owner)}/audit-events?cursor=garbage`).set(as(owner)).expect(400);
    await request(app).get(`${org(owner)}/audit-events?kind=banana`).set(as(owner)).expect(400);
  });

  it("reading it never changes it (no event is written for looking)", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await makeProject(owner);
    const before = (await rows(owner)).length;
    await request(app).get(`${org(owner)}/audit-events`).set(as(owner)).expect(200);
    expect((await rows(owner)).length).toBe(before);
  });
});

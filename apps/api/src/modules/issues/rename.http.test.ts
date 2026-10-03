import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, labels, organizationMembers, projects, users } from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";
import * as projectsRepository from "../projects/projects.repository.js";

/**
 * Rename for projects, labels and sprints (Phase 8.5 slice 3A). Real Postgres,
 * real HTTP. Each test says what bug it would catch.
 */
async function registerOwner(email: string, organizationName: string) {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name: "Owner", organizationName })
    .expect(201);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "password123" })
    .expect(200);
  return {
    token: login.body.accessToken as string,
    organizationId: login.body.organization.id as string,
    userId: login.body.user.id as string,
  };
}

/** No invite flow yet: seed a person straight into an organization with a role. */
async function addMember(organizationId: string, name: string, role: "admin" | "member" | "viewer") {
  const [user] = await db
    .insert(users)
    .values({ email: `${name.toLowerCase().replace(" ", "-")}@example.com`, passwordHash: "x", name })
    .returning();
  await db.insert(organizationMembers).values({ organizationId, userId: user!.id, role });
  return { token: signAccessToken(user!.id) };
}

const asUser = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setup() {
  const owner = await registerOwner("owner@example.com", "Org A");
  const auth = asUser(owner.token);
  const orgBase = `/api/v1/organizations/${owner.organizationId}`;
  const project = await request(app).post(`${orgBase}/projects`).set(auth).send({ name: "Website", key: "WEB" }).expect(201);
  const projectId = project.body.data.id as string;
  return { owner, auth, orgBase, projectId, projectBase: `${orgBase}/projects/${projectId}` };
}

describe("rename project (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("renames the project, trims the name, and never touches the key", async () => {
    // Catches: a rename that changes the key (which would break every issue key
    // people have written down), or stores untrimmed names.
    const { auth, projectBase, projectId } = await setup();
    const res = await request(app)
      .patch(projectBase)
      .set(auth)
      .send({ name: "  Marketing site  ", key: "HACK" })
      .expect(200);
    expect(res.body.data.name).toBe("Marketing site");
    expect(res.body.data.key).toBe("WEB");

    const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(row?.name).toBe("Marketing site");
    expect(row?.key).toBe("WEB");
  });

  it("an admin may rename; a member and a viewer may not, and nothing changes", async () => {
    // Catches: a missing manage_project guard (any member renaming the project).
    const { owner, orgBase, projectBase, projectId } = await setup();
    const admin = await addMember(owner.organizationId, "Admin One", "admin");
    const member = await addMember(owner.organizationId, "Member One", "member");
    const viewer = await addMember(owner.organizationId, "Viewer One", "viewer");

    await request(app).patch(projectBase).set(asUser(member.token)).send({ name: "By member" }).expect(403);
    await request(app).patch(projectBase).set(asUser(viewer.token)).send({ name: "By viewer" }).expect(403);
    const [unchanged] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(unchanged?.name).toBe("Website");

    await request(app).patch(projectBase).set(asUser(admin.token)).send({ name: "By admin" }).expect(200);
    const list = await request(app).get(`${orgBase}/projects`).set(asUser(admin.token)).expect(200);
    expect(list.body.data[0].name).toBe("By admin");
  });

  it("another organization cannot rename it, not even by borrowing its own org id in the URL", async () => {
    // Catches: tenant leakage. The project id belongs to org A; org B's owner
    // puts org B in the URL (where they ARE a member) and org A's project id.
    const { projectId, projectBase } = await setup();
    const outsider = await registerOwner("outsider@example.com", "Org B");

    await request(app).patch(projectBase).set(asUser(outsider.token)).send({ name: "Hijacked" }).expect(403);
    const sneaky = await request(app)
      .patch(`/api/v1/organizations/${outsider.organizationId}/projects/${projectId}`)
      .set(asUser(outsider.token))
      .send({ name: "Hijacked" })
      .expect(404);
    expect(sneaky.body.error.code).toBe("project_not_found");

    const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(row?.name).toBe("Website");
  });

  it("the query itself is scoped by organization, even without the route middleware in front", async () => {
    // Catches: relying on requireProject alone (ADR 0004: defense in depth). The
    // repository is called directly with the WRONG organization id.
    const { projectId } = await setup();
    const outsider = await registerOwner("outsider@example.com", "Org B");

    const result = await projectsRepository.updateName(
      outsider.organizationId,
      projectId,
      "Hijacked",
      outsider.userId,
    );
    expect(result).toBeUndefined();
    const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(row?.name).toBe("Website");
  });

  it("rejects an empty, blank or too long name", async () => {
    const { auth, projectBase } = await setup();
    await request(app).patch(projectBase).set(auth).send({ name: "" }).expect(400);
    await request(app).patch(projectBase).set(auth).send({ name: "   " }).expect(400);
    await request(app).patch(projectBase).set(auth).send({ name: "x".repeat(256) }).expect(400);
    await request(app).patch(projectBase).set(auth).send({}).expect(400);
  });
});

describe("rename label (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function createLabel(orgBase: string, auth: Record<string, string>, name: string, color = "#112233") {
    const res = await request(app).post(`${orgBase}/labels`).set(auth).send({ name, color }).expect(201);
    return res.body.data.id as string;
  }

  it("a plain member can rename and recolour, together or one at a time", async () => {
    const { owner, orgBase, auth } = await setup();
    const member = await addMember(owner.organizationId, "Member One", "member");
    const labelId = await createLabel(orgBase, auth, "bug");

    const both = await request(app)
      .patch(`${orgBase}/labels/${labelId}`)
      .set(asUser(member.token))
      .send({ name: "defect", color: "#FF0000" })
      .expect(200);
    expect(both.body.data).toMatchObject({ name: "defect", color: "#FF0000" });

    const colorOnly = await request(app)
      .patch(`${orgBase}/labels/${labelId}`)
      .set(auth)
      .send({ color: "#00ff00" })
      .expect(200);
    expect(colorOnly.body.data).toMatchObject({ name: "defect", color: "#00ff00" });
  });

  it("validates: empty body, empty name, bad colour, non-uuid id", async () => {
    const { orgBase, auth } = await setup();
    const labelId = await createLabel(orgBase, auth, "bug");
    await request(app).patch(`${orgBase}/labels/${labelId}`).set(auth).send({}).expect(400);
    await request(app).patch(`${orgBase}/labels/${labelId}`).set(auth).send({ name: "" }).expect(400);
    await request(app).patch(`${orgBase}/labels/${labelId}`).set(auth).send({ color: "red" }).expect(400);
    await request(app).patch(`${orgBase}/labels/not-a-uuid`).set(auth).send({ name: "x" }).expect(400);
  });

  it("a name already used by another label is a 409; keeping your own name is fine", async () => {
    // Catches: the unique-name rule surfacing as a 500, or a label conflicting with itself.
    const { orgBase, auth } = await setup();
    await createLabel(orgBase, auth, "bug");
    const feature = await createLabel(orgBase, auth, "feature");

    const clash = await request(app).patch(`${orgBase}/labels/${feature}`).set(auth).send({ name: "bug" }).expect(409);
    expect(clash.body.error.code).toBe("label_name_taken");
    await request(app).patch(`${orgBase}/labels/${feature}`).set(auth).send({ name: "feature", color: "#abcdef" }).expect(200);
  });

  it("a viewer cannot; another organization cannot, and its label id is a 404 in your own org", async () => {
    // Catches: missing permission check, and the tenant leak where org B's label
    // id is renamed through org A's URL.
    const { owner, orgBase, auth } = await setup();
    const viewer = await addMember(owner.organizationId, "Viewer One", "viewer");
    const labelId = await createLabel(orgBase, auth, "bug");
    await request(app).patch(`${orgBase}/labels/${labelId}`).set(asUser(viewer.token)).send({ name: "nope" }).expect(403);

    const outsider = await registerOwner("outsider@example.com", "Org B");
    await request(app).patch(`${orgBase}/labels/${labelId}`).set(asUser(outsider.token)).send({ name: "nope" }).expect(403);
    const sneaky = await request(app)
      .patch(`/api/v1/organizations/${outsider.organizationId}/labels/${labelId}`)
      .set(asUser(outsider.token))
      .send({ name: "nope" })
      .expect(404);
    expect(sneaky.body.error.code).toBe("label_not_found");

    const [row] = await db.select().from(labels).where(eq(labels.id, labelId));
    expect(row?.name).toBe("bug");
  });

  it("old activity keeps the name the label had at the time", async () => {
    // Catches: history being rewritten by a rename (events hold a name snapshot).
    const { orgBase, auth, projectBase } = await setup();
    const labelId = await createLabel(orgBase, auth, "bug");
    const issue = await request(app).post(`${projectBase}/issues`).set(auth).send({ title: "Tagged" }).expect(201);
    await request(app)
      .post(`${projectBase}/issues/${issue.body.data.id}/labels`)
      .set(auth)
      .send({ labelId })
      .expect(201);

    await request(app).patch(`${orgBase}/labels/${labelId}`).set(auth).send({ name: "defect" }).expect(200);

    const [event] = await db
      .select()
      .from(issueEvents)
      .where(and(eq(issueEvents.issueId, issue.body.data.id), eq(issueEvents.type, "issue.label_added")));
    expect((event?.payload as { labelName: string }).labelName).toBe("bug");
  });
});

describe("rename sprint (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function createSprint(projectBase: string, auth: Record<string, string>, name: string) {
    const res = await request(app).post(`${projectBase}/sprints`).set(auth).send({ name }).expect(201);
    return res.body.data as { id: string; version: number };
  }

  it("renames a planned and an active sprint, bumps the version, keeps the status", async () => {
    const { auth, projectBase } = await setup();
    const sprint = await createSprint(projectBase, auth, "Sprint 1");

    const renamed = await request(app)
      .patch(`${projectBase}/sprints/${sprint.id}`)
      .set(auth)
      .send({ version: sprint.version, name: "  Launch sprint " })
      .expect(200);
    expect(renamed.body.data).toMatchObject({ name: "Launch sprint", status: "planned", version: sprint.version + 1 });

    const started = await request(app)
      .patch(`${projectBase}/sprints/${sprint.id}/start`)
      .set(auth)
      .send({ version: renamed.body.data.version })
      .expect(200);
    const again = await request(app)
      .patch(`${projectBase}/sprints/${sprint.id}`)
      .set(auth)
      .send({ version: started.body.data.version, name: "Launch sprint (live)" })
      .expect(200);
    expect(again.body.data).toMatchObject({ name: "Launch sprint (live)", status: "active" });
  });

  it("a stale version is a 409 carrying the current sprint", async () => {
    // Catches: a rename that overwrites a change made since the page loaded.
    const { auth, projectBase } = await setup();
    const sprint = await createSprint(projectBase, auth, "Sprint 1");
    await request(app)
      .patch(`${projectBase}/sprints/${sprint.id}`)
      .set(auth)
      .send({ version: sprint.version, name: "First rename" })
      .expect(200);

    const stale = await request(app)
      .patch(`${projectBase}/sprints/${sprint.id}`)
      .set(auth)
      .send({ version: sprint.version, name: "Second rename" })
      .expect(409);
    expect(stale.body.error.code).toBe("version_conflict");
    expect(stale.body.error.data.current.name).toBe("First rename");
  });

  it("validates the name, refuses a viewer, and a sprint of another project is a 404", async () => {
    const { owner, auth, orgBase, projectBase } = await setup();
    const sprint = await createSprint(projectBase, auth, "Sprint 1");
    const viewer = await addMember(owner.organizationId, "Viewer One", "viewer");
    const other = await request(app).post(`${orgBase}/projects`).set(auth).send({ name: "Other", key: "OTH" }).expect(201);

    await request(app).patch(`${projectBase}/sprints/${sprint.id}`).set(auth).send({ version: sprint.version, name: " " }).expect(400);
    await request(app)
      .patch(`${projectBase}/sprints/${sprint.id}`)
      .set(asUser(viewer.token))
      .send({ version: sprint.version, name: "Nope" })
      .expect(403);
    const wrongProject = await request(app)
      .patch(`${orgBase}/projects/${other.body.data.id}/sprints/${sprint.id}`)
      .set(auth)
      .send({ version: sprint.version, name: "Nope" })
      .expect(404);
    expect(wrongProject.body.error.code).toBe("sprint_not_found");
  });
});

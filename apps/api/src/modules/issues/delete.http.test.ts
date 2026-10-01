import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { clearTestUploads, resetDatabase } from "../../db/test-utils.js";
import {
  attachments,
  comments,
  issueEvents,
  issueLabels,
  issues,
  labels,
  notifications,
  organizationMembers,
  sprints,
  users,
} from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";
import * as issuesRepository from "./issues.repository.js";

/**
 * Hard delete for issues, labels and sprints (Phase 8.5 slice 3B, ADR 0022).
 * Real Postgres, real HTTP, real files on disk. Each test says what bug it would
 * catch.
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
    userId: login.body.user.id as string,
    organizationId: login.body.organization.id as string,
  };
}

async function addMember(
  organizationId: string,
  name: string,
  role: "admin" | "member" | "viewer",
) {
  const [user] = await db
    .insert(users)
    .values({
      email: `${name.toLowerCase().replace(" ", "-")}@example.com`,
      passwordHash: "x",
      name,
    })
    .returning();
  await db.insert(organizationMembers).values({ organizationId, userId: user!.id, role });
  return { token: signAccessToken(user!.id), userId: user!.id };
}

const asUser = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setup() {
  const owner = await registerOwner("owner@example.com", "Org A");
  const auth = asUser(owner.token);
  const orgBase = `/api/v1/organizations/${owner.organizationId}`;
  const project = await request(app)
    .post(`${orgBase}/projects`)
    .set(auth)
    .send({ name: "Website", key: "WEB" })
    .expect(201);
  const projectId = project.body.data.id as string;
  const projectBase = `${orgBase}/projects/${projectId}`;

  async function createIssue(token: string, title: string) {
    const res = await request(app)
      .post(`${projectBase}/issues`)
      .set(asUser(token))
      .send({ title })
      .expect(201);
    return res.body.data.id as string;
  }
  return { owner, auth, orgBase, projectId, projectBase, createIssue };
}

const filePath = (storageKey: string) => path.join(env.UPLOADS_DIR, storageKey);

describe("delete issue (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearTestUploads();
  });

  it("removes the issue and everything under it, including the uploaded file on disk", async () => {
    // Catches: a delete that leaves comments/events/notifications behind, or
    // (the one the cascade cannot do) leaves the uploaded file orphaned on disk.
    const { owner, auth, orgBase, projectBase, createIssue } = await setup();
    const participant = await addMember(
      owner.organizationId,
      "Participant One",
      "member",
    );
    const doomed = await createIssue(owner.token, "Doomed");
    const survivor = await createIssue(owner.token, "Survivor");

    // Give the doomed issue a comment, a label, a file, and a notification for the participant.
    const label = await request(app)
      .post(`${orgBase}/labels`)
      .set(auth)
      .send({ name: "bug", color: "#112233" })
      .expect(201);
    await request(app)
      .post(`${projectBase}/issues/${doomed}/labels`)
      .set(auth)
      .send({ labelId: label.body.data.id })
      .expect(201);
    await request(app)
      .post(`${projectBase}/issues/${doomed}/comments`)
      .set(asUser(participant.token))
      .send({ body: "hi" })
      .expect(201);
    const upload = await request(app)
      .post(`${projectBase}/issues/${doomed}/attachments`)
      .set(auth)
      .attach("file", Buffer.from("bytes"), {
        filename: "a.txt",
        contentType: "text/plain",
      })
      .expect(201);
    const survivorUpload = await request(app)
      .post(`${projectBase}/issues/${survivor}/attachments`)
      .set(auth)
      .attach("file", Buffer.from("keep me"), {
        filename: "keep.txt",
        contentType: "text/plain",
      })
      .expect(201);
    const [doomedFile] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, upload.body.data.id));
    const [survivorFile] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, survivorUpload.body.data.id));
    expect(existsSync(filePath(doomedFile!.storageKey))).toBe(true);
    expect((await db.select().from(notifications)).length).toBeGreaterThan(0);

    await request(app).delete(`${projectBase}/issues/${doomed}`).set(auth).expect(204);

    expect(await db.select().from(issues).where(eq(issues.id, doomed))).toHaveLength(0);
    expect(
      await db.select().from(comments).where(eq(comments.issueId, doomed)),
    ).toHaveLength(0);
    expect(
      await db.select().from(issueEvents).where(eq(issueEvents.issueId, doomed)),
    ).toHaveLength(0);
    expect(
      await db.select().from(attachments).where(eq(attachments.issueId, doomed)),
    ).toHaveLength(0);
    expect(
      await db.select().from(issueLabels).where(eq(issueLabels.issueId, doomed)),
    ).toHaveLength(0);
    expect(await db.select().from(notifications)).toHaveLength(0);
    expect(existsSync(filePath(doomedFile!.storageKey))).toBe(false);

    // Nothing else was touched: the other issue, its file and the label itself remain.
    expect(await db.select().from(issues).where(eq(issues.id, survivor))).toHaveLength(1);
    expect(existsSync(filePath(survivorFile!.storageKey))).toBe(true);
    expect(await db.select().from(labels)).toHaveLength(1);
    await request(app).get(`${projectBase}/issues/${doomed}`).set(auth).expect(404);
  });

  it("the reporter and an admin or owner may delete; another member and a viewer may not", async () => {
    // Catches: a missing reporter-or-admin rule (any member deleting anyone's issue).
    const { owner, projectBase, createIssue } = await setup();
    const reporter = await addMember(owner.organizationId, "Reporter One", "member");
    const other = await addMember(owner.organizationId, "Other Member", "member");
    const viewer = await addMember(owner.organizationId, "Viewer One", "viewer");
    const admin = await addMember(owner.organizationId, "Admin One", "admin");

    const issueId = await createIssue(reporter.token, "Reporter's issue");
    await request(app)
      .delete(`${projectBase}/issues/${issueId}`)
      .set(asUser(other.token))
      .expect(403);
    await request(app)
      .delete(`${projectBase}/issues/${issueId}`)
      .set(asUser(viewer.token))
      .expect(403);
    expect(await db.select().from(issues).where(eq(issues.id, issueId))).toHaveLength(1);

    await request(app)
      .delete(`${projectBase}/issues/${issueId}`)
      .set(asUser(reporter.token))
      .expect(204);

    const second = await createIssue(reporter.token, "Second");
    await request(app)
      .delete(`${projectBase}/issues/${second}`)
      .set(asUser(admin.token))
      .expect(204);
    const third = await createIssue(reporter.token, "Third");
    await request(app)
      .delete(`${projectBase}/issues/${third}`)
      .set(asUser(owner.token))
      .expect(204);
  });

  it("another organization cannot delete it, and the query is scoped by organization on its own", async () => {
    // Catches: tenant leakage, including relying on the middleware alone (ADR 0004).
    const { projectId, projectBase, createIssue, owner } = await setup();
    const issueId = await createIssue(owner.token, "Private");
    const outsider = await registerOwner("outsider@example.com", "Org B");

    await request(app)
      .delete(`${projectBase}/issues/${issueId}`)
      .set(asUser(outsider.token))
      .expect(403);
    await request(app)
      .delete(
        `/api/v1/organizations/${outsider.organizationId}/projects/${projectId}/issues/${issueId}`,
      )
      .set(asUser(outsider.token))
      .expect(404);

    const direct = await issuesRepository.deleteIssue({
      organizationId: outsider.organizationId,
      projectId,
      issueId,
    });
    expect(direct.status).toBe("not_found");
    expect(await db.select().from(issues).where(eq(issues.id, issueId))).toHaveLength(1);
  });
});

describe("delete label (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearTestUploads();
  });

  it("an owner or admin deletes it; it leaves every issue, the issue stays, history keeps the name", async () => {
    const { owner, auth, orgBase, projectBase, createIssue } = await setup();
    const admin = await addMember(owner.organizationId, "Admin One", "admin");
    const label = await request(app)
      .post(`${orgBase}/labels`)
      .set(auth)
      .send({ name: "bug", color: "#112233" })
      .expect(201);
    const issueId = await createIssue(owner.token, "Tagged");
    await request(app)
      .post(`${projectBase}/issues/${issueId}/labels`)
      .set(auth)
      .send({ labelId: label.body.data.id })
      .expect(201);

    await request(app)
      .delete(`${orgBase}/labels/${label.body.data.id}`)
      .set(asUser(admin.token))
      .expect(204);

    expect(await db.select().from(labels)).toHaveLength(0);
    expect(await db.select().from(issueLabels)).toHaveLength(0);
    expect(await db.select().from(issues).where(eq(issues.id, issueId))).toHaveLength(1);
    const events = await db
      .select()
      .from(issueEvents)
      .where(eq(issueEvents.type, "issue.label_added"));
    expect((events[0]?.payload as { labelName: string }).labelName).toBe("bug");
  });

  it("a plain member and a viewer may not; another organization's label id is a 404", async () => {
    // Catches: a missing manage_project guard, and the tenant leak through a borrowed org id.
    const { owner, auth, orgBase } = await setup();
    const member = await addMember(owner.organizationId, "Member One", "member");
    const viewer = await addMember(owner.organizationId, "Viewer One", "viewer");
    const label = await request(app)
      .post(`${orgBase}/labels`)
      .set(auth)
      .send({ name: "bug", color: "#112233" })
      .expect(201);
    const labelId = label.body.data.id as string;

    await request(app)
      .delete(`${orgBase}/labels/${labelId}`)
      .set(asUser(member.token))
      .expect(403);
    await request(app)
      .delete(`${orgBase}/labels/${labelId}`)
      .set(asUser(viewer.token))
      .expect(403);

    const outsider = await registerOwner("outsider@example.com", "Org B");
    await request(app)
      .delete(`${orgBase}/labels/${labelId}`)
      .set(asUser(outsider.token))
      .expect(403);
    const sneaky = await request(app)
      .delete(`/api/v1/organizations/${outsider.organizationId}/labels/${labelId}`)
      .set(asUser(outsider.token))
      .expect(404);
    expect(sneaky.body.error.code).toBe("label_not_found");
    await request(app).delete(`${orgBase}/labels/not-a-uuid`).set(auth).expect(400);
    expect(await db.select().from(labels)).toHaveLength(1);
  });
});

describe("delete sprint (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearTestUploads();
  });

  async function createSprint(
    projectBase: string,
    auth: Record<string, string>,
    name: string,
  ) {
    const res = await request(app)
      .post(`${projectBase}/sprints`)
      .set(auth)
      .send({ name })
      .expect(201);
    return res.body.data as { id: string; version: number };
  }

  it("deletes a planned sprint and a completed one, and the issues in it stay, back in the backlog", async () => {
    // Catches: a delete that takes the sprint's issues with it (the FK must be SET NULL).
    const { owner, auth, projectBase, createIssue } = await setup();
    const planned = await createSprint(projectBase, auth, "Planned");
    const issueId = await createIssue(owner.token, "In a planned sprint");
    await db.update(issues).set({ sprintId: planned.id }).where(eq(issues.id, issueId));

    await request(app)
      .delete(`${projectBase}/sprints/${planned.id}`)
      .set(auth)
      .expect(204);
    const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(issue?.sprintId).toBeNull();

    const done = await createSprint(projectBase, auth, "Done");
    const started = await request(app)
      .patch(`${projectBase}/sprints/${done.id}/start`)
      .set(auth)
      .send({ version: done.version })
      .expect(200);
    await request(app)
      .patch(`${projectBase}/sprints/${done.id}/complete`)
      .set(auth)
      .send({ version: started.body.data.version })
      .expect(200);
    await request(app).delete(`${projectBase}/sprints/${done.id}`).set(auth).expect(204);
    expect(await db.select().from(sprints)).toHaveLength(0);
  });

  it("an active sprint cannot be deleted (409) and stays", async () => {
    // Catches: deleting the sprint people are working in, dropping the active-sprint view under them.
    const { auth, projectBase } = await setup();
    const sprint = await createSprint(projectBase, auth, "Live");
    await request(app)
      .patch(`${projectBase}/sprints/${sprint.id}/start`)
      .set(auth)
      .send({ version: sprint.version })
      .expect(200);

    const res = await request(app)
      .delete(`${projectBase}/sprints/${sprint.id}`)
      .set(auth)
      .expect(409);
    expect(res.body.error.code).toBe("sprint_active");
    expect(await db.select().from(sprints)).toHaveLength(1);
  });

  it("a member may delete; a viewer may not; a sprint of another project is a 404", async () => {
    const { owner, auth, orgBase, projectBase } = await setup();
    const member = await addMember(owner.organizationId, "Member One", "member");
    const viewer = await addMember(owner.organizationId, "Viewer One", "viewer");
    const other = await request(app)
      .post(`${orgBase}/projects`)
      .set(auth)
      .send({ name: "Other", key: "OTH" })
      .expect(201);
    const first = await createSprint(projectBase, auth, "One");
    const second = await createSprint(projectBase, auth, "Two");

    await request(app)
      .delete(`${projectBase}/sprints/${first.id}`)
      .set(asUser(viewer.token))
      .expect(403);
    const wrong = await request(app)
      .delete(`${orgBase}/projects/${other.body.data.id}/sprints/${first.id}`)
      .set(auth)
      .expect(404);
    expect(wrong.body.error.code).toBe("sprint_not_found");
    await request(app)
      .delete(`${projectBase}/sprints/${first.id}`)
      .set(asUser(member.token))
      .expect(204);
    expect((await db.select().from(sprints)).map((s) => s.id)).toEqual([second.id]);
  });
});

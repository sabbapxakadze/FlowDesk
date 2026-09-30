import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { clearTestUploads, resetDatabase } from "../../db/test-utils.js";
import { attachments, comments, issueEvents, notifications, organizationMembers, users } from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";

/**
 * Comment edit, delete and files (Phase 8.5 slice 1, ADR 0019). Real Postgres,
 * real HTTP. Every test states what bug it would catch.
 */
async function registerOwner(email: string, organizationName: string) {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name: "Owner User", organizationName })
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

/** A second user seeded straight into the org (there is no invite flow yet). */
async function addMember(organizationId: string, name: string, role: "admin" | "member" | "viewer") {
  const [user] = await db
    .insert(users)
    .values({ email: `${name.toLowerCase().replace(" ", "-")}@example.com`, passwordHash: "not-a-real-hash", name })
    .returning();
  if (!user) throw new Error("setup failed");
  await db.insert(organizationMembers).values({ organizationId, userId: user.id, role });
  return { accessToken: signAccessToken(user.id), userId: user.id };
}

async function setup() {
  const owner = await registerOwner("owner@example.com", "Org A");
  const projectRes = await request(app)
    .post(`/api/v1/organizations/${owner.organizationId}/projects`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ name: "Project", key: "AAA" })
    .expect(201);
  const projectId = projectRes.body.data.id as string;
  const issueRes = await request(app)
    .post(`/api/v1/organizations/${owner.organizationId}/projects/${projectId}/issues`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ title: "An issue" })
    .expect(201);
  const issueId = issueRes.body.data.id as string;
  const base = `/api/v1/organizations/${owner.organizationId}/projects/${projectId}/issues/${issueId}`;
  return { owner, projectId, issueId, base };
}

async function postComment(base: string, token: string, body: string) {
  const res = await request(app)
    .post(`${base}/comments`)
    .set("Authorization", `Bearer ${token}`)
    .send({ body })
    .expect(201);
  return res.body.data.id as string;
}

async function getEvents(base: string, token: string) {
  const res = await request(app).get(`${base}/events`).set("Authorization", `Bearer ${token}`).expect(200);
  return res.body.data as Array<{ type: string; payload: Record<string, unknown> }>;
}

describe("comment edit and delete (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearTestUploads();
  });

  it("edit changes the body, appends one comment_edited event, and notifies nobody", async () => {
    // Catches: editing that patches history, or that spams participants.
    const { owner, issueId, base } = await setup();
    const member = await addMember(owner.organizationId, "Member One", "member");
    const commentId = await postComment(base, owner.accessToken, "first draft");
    // Member comments too, so the owner is a participant who COULD be notified.
    await postComment(base, member.accessToken, "me too");
    const notificationsBefore = (await db.select().from(notifications)).length;

    await request(app)
      .patch(`${base}/comments/${commentId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ body: "second draft" })
      .expect(200);

    const [row] = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(row?.body).toBe("second draft");
    expect(row!.updatedAt.getTime()).toBeGreaterThan(row!.createdAt.getTime());

    const edited = await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.comment_edited"));
    expect(edited).toHaveLength(1);
    expect(edited[0]?.issueId).toBe(issueId);
    expect((await db.select().from(notifications)).length).toBe(notificationsBefore);
  });

  it("delete removes the row, appends one comment_deleted event, and notifies nobody", async () => {
    const { owner, base } = await setup();
    const member = await addMember(owner.organizationId, "Member One", "member");
    const commentId = await postComment(base, owner.accessToken, "to be removed");
    await postComment(base, member.accessToken, "me too");
    const notificationsBefore = (await db.select().from(notifications)).length;

    await request(app)
      .delete(`${base}/comments/${commentId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(204);

    expect(await db.select().from(comments).where(eq(comments.id, commentId))).toHaveLength(0);
    expect(await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.comment_deleted"))).toHaveLength(1);
    expect((await db.select().from(notifications)).length).toBe(notificationsBefore);
  });

  it("only the author can edit; a viewer and another member get 403", async () => {
    // Catches: a missing author check (the permission middleware alone lets any member through).
    const { owner, base } = await setup();
    const member = await addMember(owner.organizationId, "Member One", "member");
    const viewer = await addMember(owner.organizationId, "Viewer One", "viewer");
    const commentId = await postComment(base, member.accessToken, "member's words");

    // The owner is not the author: even an owner may not rewrite someone else's words.
    await request(app)
      .patch(`${base}/comments/${commentId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ body: "tampered" })
      .expect(403);
    await request(app)
      .patch(`${base}/comments/${commentId}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ body: "tampered" })
      .expect(403);

    const [row] = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(row?.body).toBe("member's words");
  });

  it("delete: a member cannot delete someone else's comment, an admin and the owner can", async () => {
    const { owner, base } = await setup();
    const author = await addMember(owner.organizationId, "Author One", "member");
    const other = await addMember(owner.organizationId, "Other Member", "member");
    const admin = await addMember(owner.organizationId, "Admin One", "admin");
    const viewer = await addMember(owner.organizationId, "Viewer One", "viewer");

    const first = await postComment(base, author.accessToken, "one");
    await request(app).delete(`${base}/comments/${first}`).set("Authorization", `Bearer ${other.accessToken}`).expect(403);
    await request(app).delete(`${base}/comments/${first}`).set("Authorization", `Bearer ${viewer.accessToken}`).expect(403);
    await request(app).delete(`${base}/comments/${first}`).set("Authorization", `Bearer ${admin.accessToken}`).expect(204);

    const second = await postComment(base, author.accessToken, "two");
    await request(app).delete(`${base}/comments/${second}`).set("Authorization", `Bearer ${owner.accessToken}`).expect(204);

    const third = await postComment(base, author.accessToken, "three");
    await request(app).delete(`${base}/comments/${third}`).set("Authorization", `Bearer ${author.accessToken}`).expect(204);
  });

  it("the timeline shows the edited text, hides a deleted body, and flags per viewer", async () => {
    // Catches: serving the stale original text, leaking a deleted comment's
    // text, or sending the wrong Edit/Delete buttons to a viewer.
    const { owner, base } = await setup();
    const member = await addMember(owner.organizationId, "Member One", "member");
    const editedId = await postComment(base, member.accessToken, "original wording");
    const deletedId = await postComment(base, member.accessToken, "secret original text");

    await request(app)
      .patch(`${base}/comments/${editedId}`)
      .set("Authorization", `Bearer ${member.accessToken}`)
      .send({ body: "new wording" })
      .expect(200);
    await request(app).delete(`${base}/comments/${deletedId}`).set("Authorization", `Bearer ${member.accessToken}`).expect(204);

    const asMember = await getEvents(base, member.accessToken);
    const commented = asMember.filter((e) => e.type === "issue.commented");
    expect(commented).toHaveLength(2);
    expect(commented[0]?.payload).toMatchObject({
      body: "new wording",
      edited: true,
      deleted: false,
      canEdit: true,
      canDelete: true,
    });
    expect(commented[1]?.payload).toMatchObject({ body: "", deleted: true, canEdit: false, canDelete: false });
    // Audit events are folded into the comment, not shown as timeline lines.
    expect(asMember.some((e) => e.type === "issue.comment_edited" || e.type === "issue.comment_deleted")).toBe(false);

    const asOwnerRaw = await request(app).get(`${base}/events`).set("Authorization", `Bearer ${owner.accessToken}`).expect(200);
    expect(JSON.stringify(asOwnerRaw.body)).not.toContain("secret original text");
    expect(JSON.stringify(asOwnerRaw.body)).not.toContain("original wording");
    // The owner did not write it, so cannot edit, but may delete (owner/admin).
    const ownerView = asOwnerRaw.body.data.find((e: { type: string }) => e.type === "issue.commented");
    expect(ownerView.payload).toMatchObject({ canEdit: false, canDelete: true });
  });

  it("another organization cannot edit, delete or attach to a comment (404 or 403)", async () => {
    const { owner, base } = await setup();
    const commentId = await postComment(base, owner.accessToken, "private");
    const outsider = await registerOwner("outsider@example.com", "Org B");

    await request(app)
      .patch(`${base}/comments/${commentId}`)
      .set("Authorization", `Bearer ${outsider.accessToken}`)
      .send({ body: "hijack" })
      .expect(403);
    await request(app).delete(`${base}/comments/${commentId}`).set("Authorization", `Bearer ${outsider.accessToken}`).expect(403);
    await request(app)
      .post(`${base}/attachments`)
      .set("Authorization", `Bearer ${outsider.accessToken}`)
      .field("commentId", commentId)
      .attach("file", Buffer.from("x"), { filename: "x.txt", contentType: "text/plain" })
      .expect(403);

    const [row] = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(row?.body).toBe("private");
  });

  it("a comment id from a different issue is a 404, not a cross-issue edit", async () => {
    const { owner, projectId, base } = await setup();
    const otherIssue = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/projects/${projectId}/issues`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "Other" })
      .expect(201);
    const otherBase = `/api/v1/organizations/${owner.organizationId}/projects/${projectId}/issues/${otherIssue.body.data.id}`;
    const commentId = await postComment(otherBase, owner.accessToken, "elsewhere");

    const res = await request(app)
      .patch(`${base}/comments/${commentId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ body: "x" })
      .expect(404);
    expect(res.body.error.code).toBe("comment_not_found");
  });
});

describe("files on comments (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearTestUploads();
  });

  const upload = (base: string, token: string, commentId?: string) => {
    const req = request(app).post(`${base}/attachments`).set("Authorization", `Bearer ${token}`);
    if (commentId) req.field("commentId", commentId);
    return req.attach("file", Buffer.from("file bytes"), { filename: "note.txt", contentType: "text/plain" });
  };

  it("a comment file carries commentId, writes no attachment_added event, and a direct upload has null", async () => {
    // Catches: comment files spamming the timeline, and the "never the other
    // way round" rule (a direct upload must not belong to any comment).
    const { owner, base } = await setup();
    const commentId = await postComment(base, owner.accessToken, "with a file");

    const withComment = await upload(base, owner.accessToken, commentId).expect(201);
    const direct = await upload(base, owner.accessToken).expect(201);
    expect(withComment.body.data.commentId).toBe(commentId);
    expect(direct.body.data.commentId).toBeNull();

    expect(await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.attachment_added"))).toHaveLength(1);

    const list = await request(app).get(`${base}/attachments`).set("Authorization", `Bearer ${owner.accessToken}`).expect(200);
    const byComment = list.body.data.map((a: { commentId: string | null }) => a.commentId);
    expect(byComment.sort()).toEqual([commentId, null].sort());
  });

  it("rejects a comment that is not found (404) or not yours (403) and stores no file", async () => {
    const { owner, base } = await setup();
    const member = await addMember(owner.organizationId, "Member One", "member");
    const ownersComment = await postComment(base, owner.accessToken, "owner's");

    await upload(base, member.accessToken, ownersComment).expect(403);
    await upload(base, owner.accessToken, "00000000-0000-4000-8000-000000000000").expect(404);
    await upload(base, owner.accessToken, "not-a-uuid").expect(400);

    expect(await db.select().from(attachments)).toHaveLength(0);
  });

  it("deleting the comment keeps the file as a plain issue attachment, still downloadable", async () => {
    const { owner, base } = await setup();
    const commentId = await postComment(base, owner.accessToken, "with a file");
    const up = await upload(base, owner.accessToken, commentId).expect(201);

    await request(app).delete(`${base}/comments/${commentId}`).set("Authorization", `Bearer ${owner.accessToken}`).expect(204);

    const [row] = await db.select().from(attachments);
    expect(row?.commentId).toBeNull();
    await request(app).get(up.body.data.downloadUrl as string).expect(200);
  });
});

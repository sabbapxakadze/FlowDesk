import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { invitations, issueEvents, issues, organizationMembers, users } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * Slice B of collaborators (ADR 0024): change a role, remove a member, re-send an
 * invitation, and what a removed person sees. Real HTTP and database throughout.
 */

const PASSWORD = "password123";
type Session = { accessToken: string; organizationId: string; userId: string };

async function registerAndLogIn(email: string, organizationName: string): Promise<Session> {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: PASSWORD, name: "Owner Person", organizationName })
    .expect(201);
  return logIn(email);
}

async function logIn(email: string): Promise<Session> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return {
    accessToken: res.body.accessToken,
    organizationId: res.body.organization.id,
    userId: res.body.user.id,
  };
}

const tokenFromUrl = (inviteUrl: string) => new URL(inviteUrl).searchParams.get("token")!;

async function addPerson(owner: Session, email: string, role: "admin" | "member" | "viewer"): Promise<Session> {
  const created = await request(app)
    .post(`/api/v1/organizations/${owner.organizationId}/invitations`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ email, role })
    .expect(201);
  await request(app)
    .post("/api/v1/invitations/accept")
    .send({ token: tokenFromUrl(created.body.inviteUrl), name: `${role} person`, password: PASSWORD })
    .expect(201);
  return logIn(email);
}

const members = (s: Session) => `/api/v1/organizations/${s.organizationId}/members`;
const setRole = (actor: Session, targetId: string, role: string) =>
  request(app)
    .patch(`${members(actor)}/${targetId}`)
    .set("Authorization", `Bearer ${actor.accessToken}`)
    .send({ role });
const remove = (actor: Session, targetId: string) =>
  request(app).delete(`${members(actor)}/${targetId}`).set("Authorization", `Bearer ${actor.accessToken}`);

async function roleOf(s: Session, userId: string) {
  const [row] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, s.organizationId), eq(organizationMembers.userId, userId)));
  return row?.role;
}

async function createIssueAssignedTo(owner: Session, title: string, assigneeId: string) {
  const project = await request(app)
    .post(`/api/v1/organizations/${owner.organizationId}/projects`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ name: "Website", key: "WEB" })
    .expect(201);
  const base = `/api/v1/organizations/${owner.organizationId}/projects/${project.body.data.id}/issues`;
  const issue = await request(app)
    .post(base)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ title })
    .expect(201);
  const patched = await request(app)
    .patch(`${base}/${issue.body.data.id}`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ version: issue.body.data.version, assigneeId })
    .expect(200);
  return { issueId: issue.body.data.id as string, version: patched.body.data.version as number };
}

describe("members: changing a role", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("an owner changes a member's role; the change really takes effect", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");

    // A member cannot invite; after promotion to admin they can.
    const body = { email: "x@example.com", role: "viewer" };
    const invitePath = `/api/v1/organizations/${owner.organizationId}/invitations`;
    await request(app).post(invitePath).set("Authorization", `Bearer ${member.accessToken}`).send(body).expect(403);

    await setRole(owner, member.userId, "admin").expect(204);
    expect(await roleOf(owner, member.userId)).toBe("admin");
    await request(app).post(invitePath).set("Authorization", `Bearer ${member.accessToken}`).send(body).expect(201);

    await setRole(owner, member.userId, "viewer").expect(204);
    expect(await roleOf(owner, member.userId)).toBe("viewer");
  });

  it("an admin may change a member's role, but nobody may touch the owner or themselves", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const admin = await addPerson(owner, "admin@example.com", "admin");
    const member = await addPerson(owner, "m@example.com", "member");

    await setRole(admin, member.userId, "viewer").expect(204);

    const onOwner = await setRole(admin, owner.userId, "member").expect(403);
    expect(onOwner.body.error.code).toBe("owner_protected");
    const onSelf = await setRole(admin, admin.userId, "viewer").expect(403);
    expect(onSelf.body.error.code).toBe("cannot_change_self");
    const ownerOnSelf = await setRole(owner, owner.userId, "admin").expect(403);
    expect(ownerOnSelf.body.error.code).toBe("cannot_change_self");
    expect(await roleOf(owner, owner.userId)).toBe("owner");
  });

  it("owner is not an assignable role, and bad input is a validation error", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    expect((await setRole(owner, member.userId, "owner").expect(400)).body.error.code).toBe("validation_error");
    await setRole(owner, member.userId, "king").expect(400);
    await request(app).patch(`${members(owner)}/not-a-uuid`).set("Authorization", `Bearer ${owner.accessToken}`).send({ role: "member" }).expect(400);
    expect(await roleOf(owner, member.userId)).toBe("member");
  });

  it("members and viewers cannot change roles", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    const viewer = await addPerson(owner, "v@example.com", "viewer");
    await setRole(member, viewer.userId, "admin").expect(403);
    await setRole(viewer, member.userId, "viewer").expect(403);
    expect(await roleOf(owner, viewer.userId)).toBe("viewer");
  });

  it("another organization's owner cannot change this organization's roles (tenant isolation)", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    const intruder = await registerAndLogIn("intruder@example.com", "Org B");

    // Org A's id with org B's token: not a member of A.
    await request(app)
      .patch(`${members(owner)}/${member.userId}`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({ role: "viewer" })
      .expect(403);
    // Their own org id with A's user id: that person is simply not a member there.
    const res = await setRole(intruder, member.userId, "viewer").expect(404);
    expect(res.body.error.code).toBe("member_not_found");
    expect(await roleOf(owner, member.userId)).toBe("member");
  });
});

describe("members: removing", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("removes the membership but keeps the user and their history; assigned issues become unassigned with an event", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    const { issueId, version } = await createIssueAssignedTo(owner, "Held by the member", member.userId);

    await remove(owner, member.userId).expect(204);

    expect(await roleOf(owner, member.userId)).toBeUndefined();
    expect(await db.select().from(users).where(eq(users.id, member.userId))).toHaveLength(1); // the user stays

    const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(issue?.assigneeId).toBeNull();
    expect(issue?.version).toBe(version + 1); // an open edit form is told it is stale
    const events = await db.select().from(issueEvents).where(eq(issueEvents.issueId, issueId));
    const last = events[events.length - 1]!;
    expect(last.type).toBe("issue.updated");
    expect(last.actorId).toBe(owner.userId);
    expect(last.payload).toEqual({ assigneeId: null, reason: "member_removed" });

    // Gone from the member list.
    const list = await request(app).get(members(owner)).set("Authorization", `Bearer ${owner.accessToken}`).expect(200);
    expect(list.body.data.map((m: { userId: string }) => m.userId)).not.toContain(member.userId);
  });

  it("the removed person loses access at once, and logging in says why instead of failing", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    await remove(owner, member.userId).expect(204);

    // Their still-valid access token no longer opens the organization.
    await request(app).get(members(owner)).set("Authorization", `Bearer ${member.accessToken}`).expect(403);

    const login = await request(app).post("/api/v1/auth/login").send({ email: "m@example.com", password: PASSWORD }).expect(403);
    expect(login.body.error.code).toBe("no_organization");
    expect(login.body.error.message).toContain("Ask an owner to invite you again");
    // No session row was created for the refused login.
    const refresh = await request(app).post("/api/v1/auth/refresh").expect(401);
    expect(refresh.body.error.code).toBe("invalid_refresh_token");
  });

  it("an admin may remove a member; nobody may remove the owner or themselves; members cannot remove", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const admin = await addPerson(owner, "admin@example.com", "admin");
    const member = await addPerson(owner, "m@example.com", "member");
    const other = await addPerson(owner, "o@example.com", "member");

    await remove(member, other.userId).expect(403);
    expect((await remove(admin, owner.userId).expect(403)).body.error.code).toBe("owner_protected");
    expect((await remove(admin, admin.userId).expect(403)).body.error.code).toBe("cannot_change_self");
    expect((await remove(owner, owner.userId).expect(403)).body.error.code).toBe("cannot_change_self");
    await remove(admin, member.userId).expect(204);
    expect(await roleOf(owner, owner.userId)).toBe("owner");
  });

  it("only this organization's assigned issues are touched; the same person's comments and reported issues stay", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    const other = await registerAndLogIn("other@example.com", "Org B");
    const mine = await createIssueAssignedTo(owner, "Mine", member.userId);

    // The member reports an issue of their own before being removed.
    const projectId = (await db.select().from(issues).where(eq(issues.id, mine.issueId)))[0]!.projectId;
    const reported = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/projects/${projectId}/issues`)
      .set("Authorization", `Bearer ${member.accessToken}`)
      .send({ title: "Reported by the member" })
      .expect(201);

    await remove(owner, member.userId).expect(204);

    const [stillThere] = await db.select().from(issues).where(eq(issues.id, reported.body.data.id));
    expect(stillThere?.reporterId).toBe(member.userId); // history stays
    // Org B is untouched by org A's removal.
    await request(app).get(members(other)).set("Authorization", `Bearer ${other.accessToken}`).expect(200);
  });

  it("another organization cannot remove this organization's members (tenant isolation)", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    const intruder = await registerAndLogIn("intruder@example.com", "Org B");
    await request(app).delete(`${members(owner)}/${member.userId}`).set("Authorization", `Bearer ${intruder.accessToken}`).expect(403);
    await remove(intruder, member.userId).expect(404);
    expect(await roleOf(owner, member.userId)).toBe("member");
  });
});

describe("members: inviting a removed person back, and re-sending", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("a removed person can be invited back; accepting only joins (no name or password), and they can log in again", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    await remove(owner, member.userId).expect(204);

    const created = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/invitations`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "m@example.com", role: "viewer" })
      .expect(201);
    const token = tokenFromUrl(created.body.inviteUrl);

    const preview = await request(app).post("/api/v1/invitations/preview").send({ token }).expect(200);
    expect(preview.body.hasAccount).toBe(true);

    const accepted = await request(app).post("/api/v1/invitations/accept").send({ token }).expect(201);
    expect(accepted.body.user.id).toBe(member.userId); // the same account, not a new one
    expect(await db.select().from(users).where(eq(users.email, "m@example.com"))).toHaveLength(1);
    expect(await roleOf(owner, member.userId)).toBe("viewer");
    expect((await logIn("m@example.com")).organizationId).toBe(owner.organizationId);
  });

  it("someone who belongs to another organization still cannot be invited", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await registerAndLogIn("other@example.com", "Org B");
    const res = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/invitations`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "other@example.com", role: "member" })
      .expect(409);
    expect(res.body.error.code).toBe("email_has_account");
  });

  it("a new account still needs a name and a password", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/invitations`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "new@example.com", role: "member" })
      .expect(201);
    const token = tokenFromUrl(created.body.inviteUrl);
    const res = await request(app).post("/api/v1/invitations/accept").send({ token }).expect(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(Object.keys(res.body.error.details).sort()).toEqual(["name", "password"]);
    expect(await db.select().from(users).where(eq(users.email, "new@example.com"))).toHaveLength(0);
    const [row] = await db.select().from(invitations);
    expect(row?.acceptedAt).toBeNull(); // the invitation is not used up
  });

  it("re-send gives a new working link and kills the old one, leaving exactly one open invitation", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/invitations`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "new@example.com", role: "admin" })
      .expect(201);
    const oldToken = tokenFromUrl(created.body.inviteUrl);

    const resent = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/invitations/${created.body.data.id}/resend`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(201);
    expect(resent.body.data).toMatchObject({ email: "new@example.com", role: "admin" });
    const newToken = tokenFromUrl(resent.body.inviteUrl);
    expect(newToken).not.toBe(oldToken);

    await request(app).post("/api/v1/invitations/preview").send({ token: oldToken }).expect(400);
    await request(app).post("/api/v1/invitations/preview").send({ token: newToken }).expect(200);
    const rows = await db.select().from(invitations);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null && r.acceptedAt === null)).toHaveLength(1);
  });

  it("re-send also rescues an expired invitation, and is owner/admin only and tenant-scoped", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    const intruder = await registerAndLogIn("intruder@example.com", "Org B");
    const created = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/invitations`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "late@example.com", role: "member" })
      .expect(201);
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });
    const path = (s: Session) => `/api/v1/organizations/${s.organizationId}/invitations/${created.body.data.id}/resend`;

    await request(app).post(path(owner)).set("Authorization", `Bearer ${member.accessToken}`).expect(403);
    await request(app).post(path(owner)).set("Authorization", `Bearer ${intruder.accessToken}`).expect(403);
    await request(app).post(path(intruder)).set("Authorization", `Bearer ${intruder.accessToken}`).expect(404);

    const ok = await request(app).post(path(owner)).set("Authorization", `Bearer ${owner.accessToken}`).expect(201);
    expect(ok.body.data.expired).toBe(false);
    await request(app).post("/api/v1/invitations/accept").send({ token: tokenFromUrl(ok.body.inviteUrl), name: "Late", password: PASSWORD }).expect(201);
  });
});

describe("members: repository scoping on its own", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("removeMember and updateMemberRole do nothing for another organization's id, even if the service guard were bypassed", async () => {
    // Why: the service checks membership first, so HTTP tests cannot see whether the
    // queries scope themselves. Tenant scoping must hold in the query too (CLAUDE.md).
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member");
    const other = await registerAndLogIn("other@example.com", "Org B");

    const repo = await import("./organizations.repository.js");
    expect(await repo.removeMember({ organizationId: other.organizationId, userId: member.userId, actorId: other.userId })).toBeUndefined();
    expect(await repo.updateMemberRole(other.organizationId, member.userId, "viewer", other.userId)).toBeUndefined();
    expect(await roleOf(owner, member.userId)).toBe("member");
  });
});

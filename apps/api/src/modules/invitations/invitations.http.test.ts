import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { invitations, organizationMembers, users } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * Invitations over real HTTP and the real database (ADR 0024). Each test says what
 * it protects. Users with other roles are created through the invitation flow
 * itself (invite, accept, log in), which also exercises it.
 */

const PASSWORD = "password123";

async function registerAndLogIn(email: string, organizationName: string) {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: PASSWORD, name: "Owner Person", organizationName })
    .expect(201);
  return logIn(email);
}

async function logIn(email: string, password = PASSWORD) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password }).expect(200);
  return {
    accessToken: res.body.accessToken as string,
    organizationId: res.body.organization.id as string,
    userId: res.body.user.id as string,
  };
}

const invite = (
  actor: { accessToken: string; organizationId: string },
  body: { email: string; role: string },
) =>
  request(app)
    .post(`/api/v1/organizations/${actor.organizationId}/invitations`)
    .set("Authorization", `Bearer ${actor.accessToken}`)
    .send(body);

const tokenFromUrl = (inviteUrl: string) => new URL(inviteUrl).searchParams.get("token")!;

const acceptRaw = (token: string, name = "New Person", password = PASSWORD) =>
  request(app).post("/api/v1/invitations/accept").send({ token, name, password });

/** Invites an address, accepts it, and returns that person logged in. */
async function addPerson(
  owner: { accessToken: string; organizationId: string },
  email: string,
  role: "admin" | "member" | "viewer",
) {
  const created = await invite(owner, { email, role }).expect(201);
  await acceptRaw(tokenFromUrl(created.body.inviteUrl)).expect(201);
  return logIn(email);
}

describe("invitations: creating", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("an owner invites an email; the link is returned once and only a hash is stored", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const res = await invite(owner, { email: "New@Example.com ", role: "member" }).expect(201);

    expect(res.body.data).toMatchObject({
      email: "new@example.com", // trimmed and lower-cased
      role: "member",
      invitedByName: "Owner Person",
      expired: false,
    });
    const token = tokenFromUrl(res.body.inviteUrl);
    expect(token.length).toBeGreaterThan(20);

    const [row] = await db.select().from(invitations);
    expect(row?.tokenHash).toHaveLength(64);
    expect(row?.tokenHash).not.toBe(token); // the raw token is never stored
    expect(JSON.stringify(row)).not.toContain(token);
    expect(new Date(row!.expiresAt).getTime() - Date.now()).toBeGreaterThan(6 * 24 * 3600 * 1000);
  });

  it("only owners and admins may invite; members and viewers get 403", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const admin = await addPerson(owner, "admin@example.com", "admin");
    const member = await addPerson(owner, "member@example.com", "member");
    const viewer = await addPerson(owner, "viewer@example.com", "viewer");

    await invite(admin, { email: "by-admin@example.com", role: "member" }).expect(201);
    await invite(member, { email: "x1@example.com", role: "member" }).expect(403);
    await invite(viewer, { email: "x2@example.com", role: "member" }).expect(403);
    await request(app)
      .get(`/api/v1/organizations/${owner.organizationId}/invitations`)
      .set("Authorization", `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it("the owner role cannot be invited, and bad input is a validation error", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const asOwner = await invite(owner, { email: "o2@example.com", role: "owner" }).expect(400);
    expect(asOwner.body.error.code).toBe("validation_error");
    await invite(owner, { email: "not-an-email", role: "member" }).expect(400);
    await invite(owner, { email: "ok@example.com", role: "superuser" }).expect(400);
  });

  it("refuses an email that already has an account (one organization per user for now)", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await registerAndLogIn("other@example.com", "Org B"); // has an account and an organization

    const res = await invite(owner, { email: "other@example.com", role: "member" }).expect(409);
    expect(res.body.error.code).toBe("email_has_account");
    expect(await db.select().from(invitations)).toHaveLength(0);
  });

  it("says so when the person is already a member of this organization", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await addPerson(owner, "member@example.com", "member");
    const res = await invite(owner, { email: "member@example.com", role: "admin" }).expect(409);
    expect(res.body.error.code).toBe("already_member");
    const self = await invite(owner, { email: "owner@example.com", role: "admin" }).expect(409);
    expect(self.body.error.code).toBe("already_member");
  });

  it("one open invitation per email: a second is refused, but an expired one is replaced", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await invite(owner, { email: "dup@example.com", role: "member" }).expect(201);
    const again = await invite(owner, { email: "DUP@example.com", role: "viewer" }).expect(409);
    expect(again.body.error.code).toBe("invitation_pending");

    // Expire the open one by hand, then inviting again works and the old one is revoked.
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });
    await invite(owner, { email: "dup@example.com", role: "viewer" }).expect(201);
    const rows = await db.select().from(invitations);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });
});

describe("invitations: listing and revoking", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lists only this organization's open invitations, flags expired ones, and hides revoked and accepted", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const otherOrg = await registerAndLogIn("owner-b@example.com", "Org B");

    await invite(owner, { email: "open@example.com", role: "member" }).expect(201);
    const toRevoke = await invite(owner, { email: "revoked@example.com", role: "member" }).expect(201);
    const toAccept = await invite(owner, { email: "accepted@example.com", role: "viewer" }).expect(201);
    await invite(otherOrg, { email: "foreign@example.com", role: "member" }).expect(201);

    await request(app)
      .delete(`/api/v1/organizations/${owner.organizationId}/invitations/${toRevoke.body.data.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(204);
    await acceptRaw(tokenFromUrl(toAccept.body.inviteUrl)).expect(201);
    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.email, "open@example.com"));

    const list = await request(app)
      .get(`/api/v1/organizations/${owner.organizationId}/invitations`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ email: "open@example.com", expired: true });
  });

  it("another organization's admin cannot list or revoke these invitations (tenant isolation)", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const intruder = await registerAndLogIn("intruder@example.com", "Org B");
    const created = await invite(owner, { email: "x@example.com", role: "member" }).expect(201);

    // Using org A's id with org B's token: not a member.
    await request(app)
      .get(`/api/v1/organizations/${owner.organizationId}/invitations`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .expect(403);
    // Using their OWN org id with A's invitation id: it is simply not there.
    await request(app)
      .delete(`/api/v1/organizations/${intruder.organizationId}/invitations/${created.body.data.id}`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .expect(404);
    const [row] = await db.select().from(invitations);
    expect(row?.revokedAt).toBeNull();
  });

  it("a revoked invitation can no longer be previewed or accepted", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await invite(owner, { email: "gone@example.com", role: "member" }).expect(201);
    const token = tokenFromUrl(created.body.inviteUrl);
    await request(app).post("/api/v1/invitations/preview").send({ token }).expect(200);

    await request(app)
      .delete(`/api/v1/organizations/${owner.organizationId}/invitations/${created.body.data.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(204);

    const preview = await request(app).post("/api/v1/invitations/preview").send({ token }).expect(400);
    expect(preview.body.error.code).toBe("invalid_invitation");
    await acceptRaw(token).expect(400);
    expect(await db.select().from(users).where(eq(users.email, "gone@example.com"))).toHaveLength(0);
  });
});

describe("invitations: preview and accept (public)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("preview shows what the accept page needs and nothing more", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await invite(owner, { email: "new@example.com", role: "admin" }).expect(201);
    const res = await request(app)
      .post("/api/v1/invitations/preview")
      .send({ token: tokenFromUrl(created.body.inviteUrl) })
      .expect(200);
    expect(res.body).toEqual({
      hasAccount: false,
      organizationName: "Org A",
      inviterName: "Owner Person",
      email: "new@example.com",
      role: "admin",
    });
  });

  it("an unknown or expired token is the same 400", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await invite(owner, { email: "late@example.com", role: "member" }).expect(201);
    const unknown = await request(app).post("/api/v1/invitations/preview").send({ token: "nope" }).expect(400);
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });
    const expired = await request(app)
      .post("/api/v1/invitations/preview")
      .send({ token: tokenFromUrl(created.body.inviteUrl) })
      .expect(400);
    expect(unknown.body.error.message).toBe(expired.body.error.message);
    await acceptRaw(tokenFromUrl(created.body.inviteUrl)).expect(400);
  });

  it("accepting creates a verified account that joins THIS organization with the invited role, and can log in", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await invite(owner, { email: "new@example.com", role: "viewer" }).expect(201);

    const res = await acceptRaw(tokenFromUrl(created.body.inviteUrl), "Newcomer").expect(201);
    expect(res.body.organization.id).toBe(owner.organizationId);
    expect(res.body.user).toMatchObject({ email: "new@example.com", name: "Newcomer" });
    expect(res.headers["set-cookie"]).toBeUndefined(); // signing up does not log you in

    const [user] = await db.select().from(users).where(eq(users.email, "new@example.com"));
    expect(user?.emailVerifiedAt).not.toBeNull(); // the invitation reached that address
    const memberships = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user!.id));
    expect(memberships).toHaveLength(1); // no personal organization was created
    expect(memberships[0]).toMatchObject({ organizationId: owner.organizationId, role: "viewer" });
    const [row] = await db.select().from(invitations);
    expect(row?.acceptedAt).not.toBeNull();

    const session = await logIn("new@example.com");
    expect(session.organizationId).toBe(owner.organizationId);
  });

  it("the link works once", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await invite(owner, { email: "new@example.com", role: "member" }).expect(201);
    const token = tokenFromUrl(created.body.inviteUrl);
    await acceptRaw(token).expect(201);
    await acceptRaw(token, "Someone Else", "differentpass1").expect(400);
    expect(await db.select().from(users).where(eq(users.email, "new@example.com"))).toHaveLength(1);
  });

  it("two simultaneous accepts of one link create exactly one account", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await invite(owner, { email: "race@example.com", role: "member" }).expect(201);
    const token = tokenFromUrl(created.body.inviteUrl);
    const [a, b] = await Promise.all([acceptRaw(token), acceptRaw(token)]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await db.select().from(users).where(eq(users.email, "race@example.com"))).toHaveLength(1);
  });

  it("validates the form and refuses a weak password without using up the invitation", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await invite(owner, { email: "new@example.com", role: "member" }).expect(201);
    const token = tokenFromUrl(created.body.inviteUrl);
    const weak = await acceptRaw(token, "New Person", "short").expect(400);
    expect(weak.body.error.code).toBe("validation_error");
    await acceptRaw(token, "", PASSWORD).expect(400);
    await acceptRaw(token).expect(201); // still usable
  });

  it("if the email registered itself meanwhile, accepting says so and the invitation stays open", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const created = await invite(owner, { email: "taken@example.com", role: "member" }).expect(201);
    await registerAndLogIn("taken@example.com", "Their Own Org");

    const res = await acceptRaw(tokenFromUrl(created.body.inviteUrl)).expect(409);
    expect(res.body.error.code).toBe("email_already_registered");
    const [row] = await db.select().from(invitations);
    expect(row?.acceptedAt).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, notifications, organizationMembers, users } from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";

/**
 * Issue assignee and the members list (Phase 8.5 slice 2B, ADR 0021). Real
 * Postgres, real HTTP. Each test says what bug it would catch.
 */
async function registerAndLogIn(email: string, name: string, organizationName: string) {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name, organizationName })
    .expect(201);
  const loginRes = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "password123" })
    .expect(200);
  return {
    token: loginRes.body.accessToken as string,
    userId: loginRes.body.user.id as string,
    organizationId: loginRes.body.organization.id as string,
  };
}

/** No invite flow yet: seed a second person straight into an organization. */
async function addMember(organizationId: string, name: string, role: "admin" | "member" | "viewer" = "member") {
  const [user] = await db
    .insert(users)
    .values({ email: `${name.toLowerCase().replace(" ", "-")}@example.com`, passwordHash: "not-a-real-hash", name })
    .returning();
  if (!user) throw new Error("setup failed");
  await db.insert(organizationMembers).values({ organizationId, userId: user.id, role });
  return { token: signAccessToken(user.id), userId: user.id };
}

async function setup() {
  const owner = await registerAndLogIn("owner@example.com", "Owner", "Org A");
  const auth = { Authorization: `Bearer ${owner.token}` };
  const projectRes = await request(app)
    .post(`/api/v1/organizations/${owner.organizationId}/projects`)
    .set(auth)
    .send({ name: "Project", key: "AAA" })
    .expect(201);
  const orgBase = `/api/v1/organizations/${owner.organizationId}`;
  const base = `${orgBase}/projects/${projectRes.body.data.id}`;

  async function createIssue(title: string) {
    const res = await request(app).post(`${base}/issues`).set(auth).send({ title }).expect(201);
    return res.body.data as { id: string; version: number; assigneeId: string | null };
  }
  return { owner, auth, orgBase, base, createIssue };
}

const asUser = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("members list (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lists the members of the organization and nobody from another one", async () => {
    // Catches: a members endpoint that leaks people across tenants.
    const { owner, auth, orgBase } = await setup();
    await addMember(owner.organizationId, "Second Person");
    const outsider = await registerAndLogIn("outsider@example.com", "Outsider", "Org B");

    const res = await request(app).get(`${orgBase}/members`).set(auth).expect(200);
    const names = res.body.data.map((m: { name: string }) => m.name).sort();
    expect(names).toEqual(["Owner", "Second Person"]);
    expect(JSON.stringify(res.body)).not.toContain(outsider.userId);
    expect(res.body.data[0]).toHaveProperty("role");
  });

  it("another organization cannot read this organization's members", async () => {
    // Catches: a missing membership check on the route.
    const { orgBase } = await setup();
    const outsider = await registerAndLogIn("outsider@example.com", "Outsider", "Org B");
    await request(app).get(`${orgBase}/members`).set(asUser(outsider.token)).expect(403);
  });
});

describe("issue assignee (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("a new issue is unassigned", async () => {
    const { createIssue } = await setup();
    expect((await createIssue("Fresh")).assigneeId).toBeNull();
  });

  it("assigns a member, bumps the version, and records who in the event", async () => {
    // Catches: an assignment that is not persisted, not version-checked, or leaves
    // the timeline unable to say who it was.
    const { owner, auth, base, createIssue } = await setup();
    const teammate = await addMember(owner.organizationId, "Second Person");
    const issue = await createIssue("Needs an owner");

    const res = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, assigneeId: teammate.userId })
      .expect(200);
    expect(res.body.data.assigneeId).toBe(teammate.userId);
    expect(res.body.data.version).toBe(issue.version + 1);

    const events = await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.updated"));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ assigneeId: teammate.userId, assigneeName: "Second Person" });
  });

  it("refuses a user who is not in this organization, and changes nothing", async () => {
    // Catches: THE tenant-safety bug for this feature. No foreign key can stop
    // assigning someone from another organization; only the service check does.
    const { auth, base, createIssue } = await setup();
    const outsider = await registerAndLogIn("outsider@example.com", "Outsider", "Org B");
    const issue = await createIssue("Stay put");

    const res = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, assigneeId: outsider.userId })
      .expect(400);
    expect(res.body.error.code).toBe("invalid_assignee");

    const after = await request(app).get(`${base}/issues/${issue.id}`).set(auth).expect(200);
    expect(after.body.data.assigneeId).toBeNull();
    expect(after.body.data.version).toBe(issue.version);
  });

  it("unassigns with null and records it", async () => {
    const { owner, auth, base, createIssue } = await setup();
    const teammate = await addMember(owner.organizationId, "Second Person");
    const issue = await createIssue("Handed back");
    const assigned = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, assigneeId: teammate.userId })
      .expect(200);

    const res = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: assigned.body.data.version, assigneeId: null })
      .expect(200);
    expect(res.body.data.assigneeId).toBeNull();

    const last = (await db.select().from(issueEvents).where(eq(issueEvents.type, "issue.updated"))).at(-1);
    expect(last?.payload).toEqual({ assigneeId: null, assigneeName: null });
  });

  it("?assignee= filters by person and by unassigned", async () => {
    // Catches: a filter that is ignored, or "unassigned" treated as an id (a 400/500).
    const { owner, auth, base, createIssue } = await setup();
    const teammate = await addMember(owner.organizationId, "Second Person");
    const mine = await createIssue("Theirs");
    await createIssue("Nobody's");
    await request(app)
      .patch(`${base}/issues/${mine.id}`)
      .set(auth)
      .send({ version: mine.version, assigneeId: teammate.userId })
      .expect(200);

    const theirs = await request(app).get(`${base}/issues?assignee=${teammate.userId}`).set(auth).expect(200);
    expect(theirs.body.data.map((i: { title: string }) => i.title)).toEqual(["Theirs"]);

    const none = await request(app).get(`${base}/issues?assignee=unassigned`).set(auth).expect(200);
    expect(none.body.data.map((i: { title: string }) => i.title)).toEqual(["Nobody's"]);

    await request(app).get(`${base}/issues?assignee=not-a-uuid`).set(auth).expect(400);
  });
});

describe("notifications with an assignee (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("the person just assigned is notified by the assigning event, the actor is not", async () => {
    // Catches: an assignee who hears nothing until they happen to act on the issue.
    const { owner, auth, base, createIssue } = await setup();
    const teammate = await addMember(owner.organizationId, "Second Person");
    const issue = await createIssue("Assign me");

    await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, assigneeId: teammate.userId })
      .expect(200);

    const rows = await db.select().from(notifications);
    expect(rows.map((n) => n.userId)).toEqual([teammate.userId]);
  });

  it("an assignee who never acted is notified of later activity, on top of past participants", async () => {
    // Catches: the notification rule reverting to participants only (ADR 0021),
    // or the assignee rule replacing the participant rule instead of adding to it.
    const { owner, auth, base, createIssue } = await setup();
    const assignee = await addMember(owner.organizationId, "Quiet Assignee");
    const participant = await addMember(owner.organizationId, "Past Participant");
    const issue = await createIssue("Busy issue");

    // The participant comments first (so they are a past participant), then the owner assigns.
    await request(app)
      .post(`${base}/issues/${issue.id}/comments`)
      .set(asUser(participant.token))
      .send({ body: "I looked at this" })
      .expect(201);
    await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, assigneeId: assignee.userId })
      .expect(200);
    await db.delete(notifications);

    // A new comment by the owner: both the participant and the quiet assignee hear about it.
    await request(app).post(`${base}/issues/${issue.id}/comments`).set(auth).send({ body: "Update" }).expect(201);

    const recipients = (await db.select().from(notifications)).map((n) => n.userId).sort();
    expect(recipients).toEqual([assignee.userId, participant.userId].sort());
  });

  it("when the assignee is the one acting they are not notified of their own action", async () => {
    // Catches: self-notification through the new union.
    const { owner, auth, base, createIssue } = await setup();
    const assignee = await addMember(owner.organizationId, "Quiet Assignee");
    const issue = await createIssue("Mine");
    await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, assigneeId: assignee.userId })
      .expect(200);
    await db.delete(notifications);

    await request(app)
      .post(`${base}/issues/${issue.id}/comments`)
      .set(asUser(assignee.token))
      .send({ body: "On it" })
      .expect(201);

    const recipients = (await db.select().from(notifications)).map((n) => n.userId);
    expect(recipients).toEqual([owner.userId]);
  });
});

describe("the previous assignee is told when the issue moves on (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function assign(base: string, token: string, issueId: string, version: number, assigneeId: string | null) {
    const res = await request(app)
      .patch(`${base}/issues/${issueId}`)
      .set(asUser(token))
      .send({ version, assigneeId })
      .expect(200);
    return res.body.data.version as number;
  }

  it("unassigning notifies the person who held it, even though they never acted on it", async () => {
    // Catches: the old gap (ADR 0021) where a person silently lost an issue and
    // heard nothing, because only past participants and the CURRENT assignee were told.
    const { owner, base, createIssue } = await setup();
    const holder = await addMember(owner.organizationId, "Former Holder");
    const issue = await createIssue("Taken away");
    const v2 = await assign(base, owner.token, issue.id, issue.version, holder.userId);
    await db.delete(notifications);

    await assign(base, owner.token, issue.id, v2, null);

    const recipients = (await db.select().from(notifications)).map((n) => n.userId);
    expect(recipients).toEqual([holder.userId]);
  });

  it("reassigning notifies both the previous and the new assignee", async () => {
    const { owner, base, createIssue } = await setup();
    const first = await addMember(owner.organizationId, "First Holder");
    const second = await addMember(owner.organizationId, "Second Holder");
    const issue = await createIssue("Passed on");
    const v2 = await assign(base, owner.token, issue.id, issue.version, first.userId);
    await db.delete(notifications);

    await assign(base, owner.token, issue.id, v2, second.userId);

    const recipients = (await db.select().from(notifications)).map((n) => n.userId).sort();
    expect(recipients).toEqual([first.userId, second.userId].sort());
  });

  it("someone who unassigns themselves is not notified of their own action", async () => {
    // Catches: self-notification through the new previous-assignee path.
    const { owner, base, createIssue } = await setup();
    const holder = await addMember(owner.organizationId, "Self Releaser");
    const issue = await createIssue("Mine, then not");
    const v2 = await assign(base, owner.token, issue.id, issue.version, holder.userId);
    await db.delete(notifications);

    await assign(base, holder.token, issue.id, v2, null);

    const recipients = (await db.select().from(notifications)).map((n) => n.userId);
    expect(recipients).toEqual([owner.userId]); // the owner took part; the actor is left out
  });

  it("an edit that does not touch the assignee tells nobody extra", async () => {
    // Catches: the previous-assignee list being filled on every update.
    const { owner, base, createIssue } = await setup();
    const holder = await addMember(owner.organizationId, "Steady Holder");
    const issue = await createIssue("Steady");
    const v2 = await assign(base, owner.token, issue.id, issue.version, holder.userId);
    await db.delete(notifications);

    // Only the title changes; the assignee stays: the holder is a CURRENT assignee
    // (told by the existing rule), and no "previous" recipient is added on top.
    await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(asUser(owner.token))
      .send({ version: v2, title: "Steady, renamed" })
      .expect(200);

    const recipients = (await db.select().from(notifications)).map((n) => n.userId);
    expect(recipients).toEqual([holder.userId]);
  });
});

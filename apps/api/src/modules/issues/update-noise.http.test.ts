import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, notifications, organizationMembers, users } from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";

/**
 * An update only counts, and is only logged, for fields that really changed.
 * The edit form resends title, description and status on every save; before
 * this, each save bumped the version and wrote "changed the title, changed
 * status, ..." for fields nobody touched. Real Postgres, real HTTP.
 */
async function setup() {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "owner@example.com", password: "password123", name: "Owner", organizationName: "Org A" })
    .expect(201);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "owner@example.com", password: "password123" })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
  const organizationId = login.body.organization.id as string;
  const project = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects`)
    .set(auth)
    .send({ name: "Project", key: "AAA" })
    .expect(201);
  const base = `/api/v1/organizations/${organizationId}/projects/${project.body.data.id}`;
  const created = await request(app)
    .post(`${base}/issues`)
    .set(auth)
    .send({ title: "Original title" }) // no description: stored as null
    .expect(201);
  return { organizationId, auth, base, issue: created.body.data as { id: string; version: number } };
}

const updateEvents = () => db.select().from(issueEvents).where(eq(issueEvents.type, "issue.updated"));

describe("issue update only records real changes (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("resending every field with one real change logs only that field", async () => {
    // Catches: the noise itself, "changed the title, changed status" for untouched fields.
    const { auth, base, issue } = await setup();
    const res = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, title: "Original title", description: "Now described", status: "todo" })
      .expect(200);
    expect(res.body.data.version).toBe(issue.version + 1);

    const events = await updateEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ description: "Now described" });
  });

  it("a real status change is logged alone, and still moves the card", async () => {
    // Catches: the "only what changed" filter dropping a change that is real, or
    // breaking the board-rank append that depends on a real status change.
    const { auth, base, issue } = await setup();
    const res = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, title: "Original title", description: "", status: "in_progress" })
      .expect(200);
    expect(res.body.data.status).toBe("in_progress");
    expect((await updateEvents())[0]?.payload).toEqual({ status: "in_progress" });

    const board = await request(app).get(`${base}/board`).set(auth).expect(200);
    expect(board.body.data.find((i: { id: string }) => i.id === issue.id).status).toBe("in_progress");
  });

  it("a save that changes nothing is a no-op: same version, no event, no notification", async () => {
    // Catches: pointless version bumps (which would make other open tabs think
    // the issue changed and cause false 409s) and empty activity lines. The ""
    // description against the stored null is the exact shape the form sends.
    const { organizationId, auth, base, issue } = await setup();
    const [other] = await db
      .insert(users)
      .values({ email: "other@example.com", passwordHash: "x", name: "Other" })
      .returning();
    await db.insert(organizationMembers).values({ organizationId, userId: other!.id, role: "member" });
    await request(app)
      .post(`${base}/issues/${issue.id}/comments`)
      .set({ Authorization: `Bearer ${signAccessToken(other!.id)}` })
      .send({ body: "I am a participant" })
      .expect(201);
    await db.delete(notifications);

    const res = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, title: "Original title", description: "", status: "todo" })
      .expect(200);
    expect(res.body.data.version).toBe(issue.version);
    expect(await updateEvents()).toHaveLength(0);
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("a stale version is still a 409 even when nothing would change", async () => {
    // Catches: the no-op shortcut skipping the concurrency check.
    const { auth, base, issue } = await setup();
    await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, title: "Someone else renamed it" })
      .expect(200);

    const stale = await request(app)
      .patch(`${base}/issues/${issue.id}`)
      .set(auth)
      .send({ version: issue.version, title: "Someone else renamed it" })
      .expect(409);
    expect(stale.body.error.code).toBe("version_conflict");
  });
});

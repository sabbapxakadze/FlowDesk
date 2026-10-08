import { beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { organizationMembers, users } from "../../db/schema/index.js";
import { env } from "../../config/env.js";
import { clearTestUploads, resetDatabase } from "../../db/test-utils.js";

/**
 * Profiles and photos (ADR 0028), over real HTTP, the real database and the real disk. Each test
 * says what it protects.
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

async function addPerson(owner: Session, email: string, role: "admin" | "member" | "viewer", name: string) {
  const invited = await request(app).post(`${org(owner)}/invitations`).set(as(owner)).send({ email, role }).expect(201);
  const token = new URL(invited.body.inviteUrl).searchParams.get("token")!;
  await request(app).post("/api/v1/invitations/accept").send({ token, name, password: PASSWORD }).expect(201);
  return logIn(email);
}

const profileOf = (viewer: Session, target: Session) => request(app).get(`${org(viewer)}/members/${target.userId}/profile`).set(as(viewer));
const activityOf = (viewer: Session, target: Session, query = "") =>
  request(app).get(`${org(viewer)}/members/${target.userId}/activity${query}`).set(as(viewer));

async function picture(width = 600, height = 300, format: "png" | "jpeg" = "png"): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } });
  return format === "png" ? image.png().toBuffer() : image.jpeg().toBuffer();
}

const upload = (s: Session, file: Buffer, contentType = "image/png") =>
  request(app).put("/api/v1/users/me/avatar").set(as(s)).attach("file", file, { filename: "me.png", contentType });

const avatarFiles = async () => (await readdir(env.UPLOADS_DIR).catch(() => [] as string[])).filter((f) => f.startsWith("avatar-"));

async function makeIssue(s: Session, title = "An issue", projectName = "Website", key = "WEB") {
  const project = await request(app).post(`${org(s)}/projects`).set(as(s)).send({ name: projectName, key }).expect(201);
  const projectId = project.body.data.id as string;
  const issue = await request(app).post(`${org(s)}/projects/${projectId}/issues`).set(as(s)).send({ title }).expect(201);
  return { projectId, issueId: issue.body.data.id as string, base: `${org(s)}/projects/${projectId}/issues/${issue.body.data.id as string}` };
}

beforeEach(async () => {
  await resetDatabase();
  await clearTestUploads();
});
afterAll(async () => {
  await clearTestUploads();
});

describe("editing your own profile", () => {
  it("saves name, job title and bio; blanks clear them; the members list shows the same", async () => {
    // Why: the whole edit round trip, and that other people see the change through the list.
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const member = await addPerson(owner, "m@example.com", "member", "Max Member");

    await request(app)
      .patch("/api/v1/users/me/profile")
      .set(as(member))
      .send({ name: "  Maxine Member ", jobTitle: "Backend engineer", bio: "I keep the API fast." })
      .expect(204);

    const seen = await profileOf(owner, member).expect(200);
    expect(seen.body.data).toMatchObject({ name: "Maxine Member", jobTitle: "Backend engineer", bio: "I keep the API fast.", avatarUrl: null, role: "member" });
    const list = await request(app).get(`${org(owner)}/members`).set(as(owner)).expect(200);
    expect(list.body.data.find((m: { userId: string }) => m.userId === member.userId)).toMatchObject({ name: "Maxine Member", jobTitle: "Backend engineer", avatarUrl: null });

    await request(app).patch("/api/v1/users/me/profile").set(as(member)).send({ name: "Maxine Member", jobTitle: "  ", bio: "" }).expect(204);
    const cleared = await profileOf(owner, member).expect(200);
    expect(cleared.body.data).toMatchObject({ jobTitle: null, bio: null });
  });

  it("refuses an empty name and over-long fields, and changes nothing", async () => {
    // Why: the limits in the contract are the server rule, not just form hints.
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    for (const bad of [
      { name: "   ", jobTitle: null, bio: null },
      { name: "Olivia", jobTitle: "x".repeat(101), bio: null },
      { name: "Olivia", jobTitle: null, bio: "x".repeat(301) },
    ]) {
      const res = await request(app).patch("/api/v1/users/me/profile").set(as(owner)).send(bad).expect(400);
      expect(res.body.error.code).toBe("validation_error");
    }
    expect((await profileOf(owner, owner).expect(200)).body.data.name).toBe("Olivia Owner");
  });

  it("needs a login", async () => {
    await request(app).patch("/api/v1/users/me/profile").send({ name: "X", jobTitle: null, bio: null }).expect(401);
    await request(app).put("/api/v1/users/me/avatar").expect(401);
    await request(app).delete("/api/v1/users/me/avatar").expect(401);
  });
});

describe("the photo", () => {
  it("is stored as a 256x256 WebP and served to anyone holding the URL, with caching headers", async () => {
    // Why: the whole point of processing on upload (square, small, one format, no metadata)
    // and of the public capability URL an img tag can load without a token.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const res = await upload(owner, await picture(600, 300)).expect(200);
    const url = res.body.avatarUrl as string;
    expect(url).toMatch(/^\/api\/v1\/avatars\/[a-f0-9]{32}$/);

    const served = await request(app).get(url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.headers["cache-control"]).toContain("immutable");
    const meta = await sharp(served.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });

    expect((await profileOf(owner, owner).expect(200)).body.data.avatarUrl).toBe(url);
  });

  it("with STORAGE_DRIVER=disabled the photo is refused with a clear message and nothing changes (ADR 0049)", async () => {
    // Why: a host with no persistent disk cannot keep the picture; the refusal comes before the image work and before any database change.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const before = env.STORAGE_DRIVER;
    env.STORAGE_DRIVER = "disabled";
    try {
      const res = await upload(owner, await picture());
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("uploads_disabled");
    } finally {
      env.STORAGE_DRIVER = before;
    }
    expect(await avatarFiles()).toEqual([]);
    expect((await profileOf(owner, owner).expect(200)).body.data.avatarUrl).toBeNull();
  });

  it("refuses a file that is not really a picture, even when it claims to be one", async () => {
    // Why: the MIME type is the client's claim; decoding the bytes is the real check.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const res = await upload(owner, Buffer.from("this is just text, named .png")).expect(400);
    expect(res.body.error.code).toBe("invalid_image");
    expect(await avatarFiles()).toHaveLength(0);
  });

  it("refuses a type we do not accept and a file over 5 MB", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    expect((await upload(owner, await picture(), "image/gif").expect(400)).body.error.code).toBe("invalid_image");
    const big = await upload(owner, Buffer.alloc(5 * 1024 * 1024 + 1)).expect(400);
    expect(big.body.error.code).toBe("file_too_large");
    expect(await avatarFiles()).toHaveLength(0);
  });

  it("a new photo replaces the old one: new URL, old URL gone, old file deleted from disk", async () => {
    // Why: no leaked files, and no stale picture reachable by an old link.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const first = (await upload(owner, await picture()).expect(200)).body.avatarUrl as string;
    expect(await avatarFiles()).toHaveLength(1);
    const second = (await upload(owner, await picture(300, 600, "jpeg"), "image/jpeg").expect(200)).body.avatarUrl as string;
    expect(second).not.toBe(first);
    await request(app).get(first).expect(404);
    await request(app).get(second).expect(200);
    expect(await avatarFiles()).toEqual([`avatar-${second.split("/").pop()}`]);
  });

  it("removing it clears the profile, the URL and the file", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const url = (await upload(owner, await picture()).expect(200)).body.avatarUrl as string;
    const res = await request(app).delete("/api/v1/users/me/avatar").set(as(owner)).expect(200);
    expect(res.body.avatarUrl).toBeNull();
    await request(app).get(url).expect(404);
    expect(await avatarFiles()).toHaveLength(0);
    expect((await profileOf(owner, owner).expect(200)).body.data.avatarUrl).toBeNull();
    // Removing when there is none is fine.
    await request(app).delete("/api/v1/users/me/avatar").set(as(owner)).expect(200);
  });

  it("answers 404 for an unknown key, a malformed key, and a key whose row no longer exists", async () => {
    // Why: the key is the access, so a guess or a leftover file must not be served.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await request(app).get(`/api/v1/avatars/${"a".repeat(32)}`).expect(404);
    await request(app).get("/api/v1/avatars/not-a-key").expect(404);
    await request(app).get("/api/v1/avatars/..%2F..%2Fsecret").expect(404);
    const url = (await upload(owner, await picture()).expect(200)).body.avatarUrl as string;
    await db.update(users).set({ avatarKey: null }).where(eq(users.id, owner.userId));
    await request(app).get(url).expect(404); // the file is still on disk, but nobody owns the key
  });

  it("shows in the members list for everyone in the organization", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member", "Max Member");
    const url = (await upload(member, await picture()).expect(200)).body.avatarUrl as string;
    const list = await request(app).get(`${org(owner)}/members`).set(as(owner)).expect(200);
    expect(list.body.data.find((m: { userId: string }) => m.userId === member.userId).avatarUrl).toBe(url);
  });
});

describe("who can see a profile", () => {
  it("members of the organization, whatever their role, including a viewer", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const viewer = await addPerson(owner, "v@example.com", "viewer", "Vic Viewer");
    const res = await profileOf(viewer, owner).expect(200);
    expect(res.body.data).toMatchObject({ name: "Olivia Owner", email: "owner@example.com", role: "owner" });
    await profileOf(owner, viewer).expect(200);
  });

  it("not people of another organization, whichever way it is asked", async () => {
    // Why: tenant isolation. A stranger cannot use the URL of our organization, and cannot reach
    // our people by id through their own.
    const a = await registerAndLogIn("a@example.com", "Org A", "Alice");
    const b = await registerAndLogIn("b@example.com", "Org B", "Bob");
    await profileOf(b, a).expect(404); // Bob's own organization, Alice's id
    await request(app).get(`${org(a)}/members/${a.userId}/profile`).set(as(b)).expect(403); // Alice's organization
    await activityOf(b, a).expect(404);
    await request(app).get(`${org(a)}/members/${a.userId}/activity`).set(as(b)).expect(403);
  });

  it("not someone who has been removed from the organization", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member", "Max Member");
    await profileOf(owner, member).expect(200);
    await request(app).delete(`${org(owner)}/members/${member.userId}`).set(as(owner)).expect(204);
    await profileOf(owner, member).expect(404);
  });

  it("a malformed id is a 404, not a server error", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await request(app).get(`${org(owner)}/members/not-a-uuid/profile`).set(as(owner)).expect(404);
  });
});

describe("recent activity", () => {
  it("lists only that person's events, newest first, with the issue key and title, and never a comment's text", async () => {
    // Why: the feature itself, plus the privacy rule that comment bodies and descriptions are
    // not served from here.
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const member = await addPerson(owner, "m@example.com", "member", "Max Member");
    const { base } = await makeIssue(owner, "Login page");
    await request(app).post(`${base}/comments`).set(as(member)).send({ body: "SECRET-COMMENT-TEXT" }).expect(201);
    await request(app).post(`${base}/comments`).set(as(owner)).send({ body: "owner comment" }).expect(201);
    const current = await request(app).get(base).set(as(member)).expect(200);
    await request(app)
      .patch(base)
      .set(as(member))
      .send({ version: current.body.data.version, description: "SECRET-DESCRIPTION", priority: "high" })
      .expect(200);

    const res = await activityOf(owner, member).expect(200);
    expect(res.body.data.map((e: { type: string }) => e.type)).toEqual(["issue.updated", "issue.commented"]);
    expect(res.body.data[0]).toMatchObject({ issueKey: "WEB-1", issueTitle: "Login page" });
    expect(res.body.data[0].payload).toMatchObject({ priority: "high", description: true });
    expect(JSON.stringify(res.body)).not.toContain("SECRET-COMMENT-TEXT");
    expect(JSON.stringify(res.body)).not.toContain("SECRET-DESCRIPTION");
    expect(res.body.nextCursor).toBeNull();
  });

  it("pages with a cursor and repeats nothing", async () => {
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const { base } = await makeIssue(owner);
    for (let i = 0; i < 5; i++) {
      await request(app).post(`${base}/comments`).set(as(owner)).send({ body: `c${i}` }).expect(201);
    }
    // Five comments plus the issue's own creation = 6 events.
    const first = await activityOf(owner, owner, "?limit=4").expect(200);
    expect(first.body.data).toHaveLength(4);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await activityOf(owner, owner, `?limit=4&cursor=${first.body.nextCursor}`).expect(200);
    expect(second.body.data).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.data, ...second.body.data].map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(6);
    await activityOf(owner, owner, "?cursor=garbage").expect(400);
  });

  it("does not include what the same person did in another organization", async () => {
    // Why: the query is scoped by the issue's organization, not just by who did it.
    const a = await registerAndLogIn("a@example.com", "Org A", "Alice");
    const b = await registerAndLogIn("b@example.com", "Org B", "Bob");
    await db.insert(organizationMembers).values({ organizationId: b.organizationId, userId: a.userId, role: "member" });
    await makeIssue(a, "In A", "Alpha", "AAA");
    await makeIssue(b, "Bobs issue", "Beta", "BBB");
    const inB = await request(app).post(`${org(b)}/projects`).set(as(b)).send({ name: "Gamma", key: "GGG" }).expect(201);
    // Alice (a member of B too) creates an issue in B.
    await request(app).post(`${org(b)}/projects/${inB.body.data.id}/issues`).set({ Authorization: `Bearer ${a.token}` }).send({ title: "Alice in B" }).expect(201);

    const fromA = await activityOf(a, a).expect(200);
    expect(fromA.body.data.map((e: { issueTitle: string }) => e.issueTitle)).toEqual(["In A"]);
    const fromB = await activityOf(b, a).expect(200);
    expect(fromB.body.data.map((e: { issueTitle: string }) => e.issueTitle)).toEqual(["Alice in B"]);
  });

  it("drops the lines of an issue that was deleted", async () => {
    // Why: the events went with the issue, so there is nothing to link to.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const { base } = await makeIssue(owner, "Short lived");
    expect((await activityOf(owner, owner).expect(200)).body.data).toHaveLength(1);
    await request(app).delete(base).set(as(owner)).expect(204);
    expect((await activityOf(owner, owner).expect(200)).body.data).toHaveLength(0);
  });
});

describe('the "Finish your profile" card', () => {
  const nudge = (s: Session) => request(app).get("/api/v1/users/me/profile-nudge").set(as(s));
  const dismiss = (s: Session) => request(app).post("/api/v1/users/me/profile-nudge/dismiss").set(as(s));
  const edit = (s: Session, body: { name: string; jobTitle: string | null; bio: string | null }) =>
    request(app).patch("/api/v1/users/me/profile").set(as(s)).send(body).expect(204);

  it("is shown to someone with a bare profile, and goes away once a title, a bio or a photo is added", async () => {
    // Why: the card is only useful while the profile is empty; each of the three fields counts.
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    expect((await nudge(owner).expect(200)).body).toEqual({ show: true });

    await edit(owner, { name: "Olivia Owner", jobTitle: "Lead", bio: null });
    expect((await nudge(owner).expect(200)).body.show).toBe(false);
    await edit(owner, { name: "Olivia Owner", jobTitle: null, bio: null });
    expect((await nudge(owner).expect(200)).body.show).toBe(true); // empty again, not dismissed

    await edit(owner, { name: "Olivia Owner", jobTitle: null, bio: "Hi" });
    expect((await nudge(owner).expect(200)).body.show).toBe(false);
    await edit(owner, { name: "Olivia Owner", jobTitle: null, bio: null });

    await upload(owner, await picture()).expect(200);
    expect((await nudge(owner).expect(200)).body.show).toBe(false);
  });

  it("stays hidden for good after Not now, for that person only, and pressing it twice is fine", async () => {
    // Why: dismissal is stored on the account (not the browser) and must not leak to others.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "m@example.com", "member", "Max Member");
    await dismiss(owner).expect(204);
    await dismiss(owner).expect(204);
    expect((await nudge(owner).expect(200)).body.show).toBe(false);
    expect((await nudge(member).expect(200)).body.show).toBe(true);
    // Even with an empty profile, it does not come back.
    const again = await logIn("owner@example.com");
    expect((await nudge(again).expect(200)).body.show).toBe(false);
  });

  it("needs a login", async () => {
    await request(app).get("/api/v1/users/me/profile-nudge").expect(401);
    await request(app).post("/api/v1/users/me/profile-nudge/dismiss").expect(401);
  });
});

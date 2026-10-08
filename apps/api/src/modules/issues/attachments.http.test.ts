import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { env } from "../../config/env.js";
import { clearTestUploads, resetDatabase } from "../../db/test-utils.js";

/**
 * HTTP-level round trip: a real multipart upload via supertest's
 * .attach(), through the real multer + validation + disk-write path,
 * then a real download through the signed URL the list response
 * returned — proving the bytes survive the whole trip, not just that
 * each half works in isolation. See the Phase 7 slice 4 plan.
 */
async function registerAndLogIn(email: string, organizationName: string) {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name: "Test User", organizationName })
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

async function createProject(accessToken: string, organizationId: string, key: string) {
  const res = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: `Project ${key}`, key })
    .expect(201);
  return res.body.data.id as string;
}

async function createIssue(accessToken: string, organizationId: string, projectId: string, title: string) {
  const res = await request(app)
    .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/issues`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title })
    .expect(201);
  return res.body.data.id as string;
}

describe("attachments — HTTP", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearTestUploads();
  });

  it("uploads a real file and downloads the identical bytes back through the signed URL", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issueId = await createIssue(userA.accessToken, userA.organizationId, projectId, "Has an attachment");

    const fileContents = Buffer.from("these are the real file bytes, round-tripped");

    const uploadRes = await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueId}/attachments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", fileContents, { filename: "note.txt", contentType: "text/plain" })
      .expect(201);

    expect(uploadRes.body.data.filename).toBe("note.txt");
    expect(uploadRes.body.data.sizeBytes).toBe(fileContents.length);
    const downloadUrl = uploadRes.body.data.downloadUrl as string;
    expect(downloadUrl).toContain("/api/v1/attachments/");

    // downloadUrl is already the real, full server-relative path
    // (app.ts mounts issuesRouter at /api/v1) — usable as-is, whether
    // that's a raw <a href> in the browser or a direct request here.
    const downloadRes = await request(app).get(downloadUrl).expect(200);

    // text/plain isn't superagent's JSON/urlencoded parsers, so it lands
    // in res.text (a string), not res.body (a Buffer needs an explicit
    // binary parser) — comparing the string form is still a genuine
    // byte-for-byte round-trip check for this text payload.
    expect(downloadRes.text).toBe(fileContents.toString());
    expect(downloadRes.headers["content-type"]).toContain("text/plain");
  });

  it("rejects a download with a tampered signature", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issueId = await createIssue(userA.accessToken, userA.organizationId, projectId, "Has an attachment");

    const uploadRes = await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueId}/attachments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", Buffer.from("secret"), { filename: "note.txt", contentType: "text/plain" })
      .expect(201);

    const downloadUrl = uploadRes.body.data.downloadUrl as string;
    const tamperedUrl = downloadUrl.replace(/sig=[0-9a-f]+/, "sig=0000000000000000");

    await request(app).get(tamperedUrl).expect(403);
  });

  it("rejects an oversized upload with a real validation error, not a raw 500", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issueId = await createIssue(userA.accessToken, userA.organizationId, projectId, "Has an attachment");

    // An allowed mime type, deliberately — this must fail on size, not
    // on type, so it actually proves the size limit, not the filter.
    const tooLarge = Buffer.alloc(11 * 1024 * 1024, "x"); // over the 10MB cap

    const res = await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueId}/attachments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", tooLarge, { filename: "big.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("file_too_large");
  });

  it("rejects a disallowed file type with a real validation error", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issueId = await createIssue(userA.accessToken, userA.organizationId, projectId, "Has an attachment");

    const res = await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueId}/attachments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", Buffer.from("#!/bin/sh\necho hi"), {
        filename: "script.sh",
        contentType: "application/x-sh",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unsupported_file_type");
  });

  it("deletes an attachment so it no longer appears in the list", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issueId = await createIssue(userA.accessToken, userA.organizationId, projectId, "Has an attachment");

    const uploadRes = await request(app)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueId}/attachments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .attach("file", Buffer.from("to be deleted"), { filename: "note.txt", contentType: "text/plain" })
      .expect(201);
    const attachmentId = uploadRes.body.data.id as string;

    await request(app)
      .delete(
        `/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueId}/attachments/${attachmentId}`,
      )
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);

    const listRes = await request(app)
      .get(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueId}/attachments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(listRes.body.data).toEqual([]);
  });
  describe("video files and range requests", () => {
    // 2000 distinct, non-repeating bytes so a wrong slice cannot match by accident.
    const video = Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 7 + 3) % 256));

    async function uploadVideo(contentType: string, filename: string, bytes: Buffer = video) {
      const user = await registerAndLogIn("v@example.com", "Org V");
      const projectId = await createProject(user.accessToken, user.organizationId, "VVV");
      const issueId = await createIssue(user.accessToken, user.organizationId, projectId, "Has a video");
      const res = await request(app)
        .post(`/api/v1/organizations/${user.organizationId}/projects/${projectId}/issues/${issueId}/attachments`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .attach("file", bytes, { filename, contentType });
      return { res, user };
    }

    const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    };

    it("accepts mp4 and webm, and still rejects another video type", async () => {
      expect((await uploadVideo("video/mp4", "a.mp4")).res.status).toBe(201);
      await resetDatabase();
      expect((await uploadVideo("video/webm", "a.webm")).res.status).toBe(201);
      await resetDatabase();
      const rejected = await uploadVideo("video/quicktime", "a.mov");
      expect(rejected.res.status).toBe(400);
      expect(rejected.res.body.error.code).toBe("unsupported_file_type");
    });

    it("keeps the 10 MB cap for video", async () => {
      const { res } = await uploadVideo("video/mp4", "big.mp4", Buffer.alloc(11 * 1024 * 1024, 1));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("file_too_large");
    });

    it("sends the whole file with length, Accept-Ranges and nosniff when no Range is asked", async () => {
      const { res } = await uploadVideo("video/mp4", "a.mp4");
      const down = await request(app).get(res.body.data.downloadUrl).buffer(true).parse(binary).expect(200);
      expect(down.headers["accept-ranges"]).toBe("bytes");
      expect(down.headers["content-length"]).toBe("2000");
      expect(down.headers["x-content-type-options"]).toBe("nosniff");
      expect(down.headers["content-type"]).toContain("video/mp4");
      expect(Buffer.compare(down.body as Buffer, video)).toBe(0);
    });

    it.each([
      ["bytes=0-99", 0, 99],
      ["bytes=1000-1499", 1000, 1499],
      ["bytes=1900-", 1900, 1999],
      ["bytes=-50", 1950, 1999],
    ])("answers %s with 206 and exactly those bytes", async (header, start, end) => {
      const { res } = await uploadVideo("video/webm", "a.webm");
      const down = await request(app)
        .get(res.body.data.downloadUrl)
        .set("Range", header)
        .buffer(true)
        .parse(binary)
        .expect(206);
      expect(down.headers["content-range"]).toBe(`bytes ${start}-${end}/2000`);
      expect(down.headers["content-length"]).toBe(String(end - start + 1));
      expect(Buffer.compare(down.body as Buffer, video.subarray(start, end + 1))).toBe(0);
    });

    it("answers a range past the end with 416 and the file size", async () => {
      const { res } = await uploadVideo("video/mp4", "a.mp4");
      const down = await request(app).get(res.body.data.downloadUrl).set("Range", "bytes=5000-").expect(416);
      expect(down.headers["content-range"]).toBe("bytes */2000");
    });

    it("ignores several ranges and sends the whole file", async () => {
      const { res } = await uploadVideo("video/mp4", "a.mp4");
      const down = await request(app)
        .get(res.body.data.downloadUrl)
        .set("Range", "bytes=0-9,20-29")
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((down.body as Buffer).length).toBe(2000);
    });

    it("still refuses a tampered signature when a Range is sent", async () => {
      const { res } = await uploadVideo("video/mp4", "a.mp4");
      const tampered = (res.body.data.downloadUrl as string).replace(/sig=[0-9a-f]+/, "sig=00");
      await request(app).get(tampered).set("Range", "bytes=0-9").expect(403);
    });

    it("answers 404, not a crash, when the stored file has gone missing", async () => {
      const { res } = await uploadVideo("video/mp4", "a.mp4");
      await clearTestUploads();
      await request(app).get(res.body.data.downloadUrl).expect(404);
    });
  });

  it("with STORAGE_DRIVER=disabled an upload is refused with a clear message and nothing is stored or recorded (ADR 0049)", async () => {
    // Why: on a host whose disk is wiped on restart (Render free) an accepted file would vanish silently; refusing it says so up front.
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issueId = await createIssue(userA.accessToken, userA.organizationId, projectId, "No uploads here");
    const uploadUrl = `/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueId}/attachments`;

    const before = env.STORAGE_DRIVER;
    env.STORAGE_DRIVER = "disabled";
    try {
      const res = await request(app)
        .post(uploadUrl)
        .set("Authorization", `Bearer ${userA.accessToken}`)
        .attach("file", Buffer.from("not kept"), { filename: "note.txt", contentType: "text/plain" });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("uploads_disabled");
      expect(res.body.error.message).toContain("switched off");
    } finally {
      env.STORAGE_DRIVER = before;
    }

    const list = await request(app).get(uploadUrl).set("Authorization", `Bearer ${userA.accessToken}`).expect(200);
    expect(list.body.data).toEqual([]);
  });
});

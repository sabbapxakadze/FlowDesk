import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
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
});

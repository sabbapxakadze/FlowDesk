import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { type Socket as ClientSocket, io as ioClient } from "socket.io-client";
import { app } from "../app.js";
import { resetDatabase } from "../db/test-utils.js";
import { attachSocketServer } from "./socket-server.js";

let httpServer: ReturnType<typeof createServer>;
let url: string;
let clients: ClientSocket[];

/**
 * Unlike socket-server.test.ts (a bare http.Server, no Express app),
 * this wraps the real app — the only way to drive a genuine HTTP
 * mutation and observe its broadcast on the same real server, over the
 * real stack. This is the one thing in this slice that's easy to wire
 * and silently ship broken (a broadcast that never fires, or fires into
 * the wrong room) — worth proving directly, not just reading the code.
 */
async function registerAndLogIn(email: string, organizationName: string) {
  await request(httpServer)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name: "Test User", organizationName })
    .expect(201);

  const loginRes = await request(httpServer)
    .post("/api/v1/auth/login")
    .send({ email, password: "password123" })
    .expect(200);

  return {
    accessToken: loginRes.body.accessToken as string,
    organizationId: loginRes.body.organization.id as string,
  };
}

async function createProject(accessToken: string, organizationId: string, key: string) {
  const res = await request(httpServer)
    .post(`/api/v1/organizations/${organizationId}/projects`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: `Project ${key}`, key })
    .expect(201);
  return res.body.data.id as string;
}

async function createIssue(accessToken: string, organizationId: string, projectId: string, title: string) {
  const res = await request(httpServer)
    .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/issues`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title })
    .expect(201);
  return res.body.data as { id: string; version: number };
}

/**
 * join:project relies on socket.data.organizationId, which only a prior
 * successful join:org sets (see socket-server.ts) — same dependency
 * requireProject has on requireOrgMembership having already run over
 * HTTP. Connects, joins org, then joins the given project, and returns
 * the connected socket.
 */
async function connectAndJoinProject(
  accessToken: string,
  organizationId: string,
  projectId: string,
): Promise<ClientSocket> {
  const socket = ioClient(url, { auth: { token: accessToken } });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });
  await new Promise<{ ok: boolean }>((resolve) => socket.emit("join:org", { organizationId }, resolve));
  await new Promise<{ ok: boolean }>((resolve) => socket.emit("join:project", { projectId }, resolve));
  return socket;
}

describe("broadcast on issue mutations", () => {
  beforeEach(async () => {
    await resetDatabase();
    httpServer = createServer(app);
    attachSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("broadcasts issue:changed into the project room when an issue moves", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Movable");

    const socket = await connectAndJoinProject(userA.accessToken, userA.organizationId, projectId);
    clients.push(socket);

    const received = new Promise<{ issueId: string }>((resolve) => {
      socket.on("issue:changed", resolve);
    });

    await request(httpServer)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/move`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: issue.version, status: "in_progress" })
      .expect(200);

    const event = await received;
    expect(event).toEqual({ issueId: issue.id });
  });

  it("broadcasts issue:changed when a new issue is created", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");

    const socket = await connectAndJoinProject(userA.accessToken, userA.organizationId, projectId);
    clients.push(socket);

    const received = new Promise<{ issueId: string }>((resolve) => {
      socket.on("issue:changed", resolve);
    });

    const createRes = await request(httpServer)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ title: "New issue" })
      .expect(201);

    const event = await received;
    expect(event).toEqual({ issueId: createRes.body.data.id });
  });

  it("never broadcasts into a project room the socket never joined", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");
    const projectA = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const projectB = await createProject(userB.accessToken, userB.organizationId, "BBB");
    const issueA = await createIssue(userA.accessToken, userA.organizationId, projectA, "In A");

    // userB's socket joins its own project room, not A's.
    const socketB = await connectAndJoinProject(userB.accessToken, userB.organizationId, projectB);
    clients.push(socketB);

    let receivedByB = false;
    socketB.on("issue:changed", () => {
      receivedByB = true;
    });

    await request(httpServer)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectA}/issues/${issueA.id}/move`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: issueA.version, status: "done" })
      .expect(200);

    // Give any (incorrect) cross-room delivery a moment to arrive before
    // asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedByB).toBe(false);
  });

  it("rejects join:project for a project outside the caller's own org", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");
    const projectB = await createProject(userB.accessToken, userB.organizationId, "BBB");

    const socketA = ioClient(url, { auth: { token: userA.accessToken } });
    clients.push(socketA);
    await new Promise<void>((resolve, reject) => {
      socketA.on("connect", () => resolve());
      socketA.on("connect_error", reject);
    });
    await new Promise<{ ok: boolean }>((resolve) =>
      socketA.emit("join:org", { organizationId: userA.organizationId }, resolve),
    );

    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      socketA.emit("join:project", { projectId: projectB }, resolve);
    });

    expect(ack.ok).toBe(false);
  });
});

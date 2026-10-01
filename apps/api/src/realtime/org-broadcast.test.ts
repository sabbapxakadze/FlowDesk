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
 * Broadcasts for renames and deletes of shared things (Phase 8.5 slices 3A to 3C
 * and the polish slice): org:changed, project:deleted, issue:deleted. These are
 * easy to wire and silently ship broken (never fired, fired into the wrong room),
 * so each is observed on a real socket after a real HTTP mutation. Other
 * organizations must never hear any of them.
 */
async function registerAndLogIn(email: string, organizationName: string) {
  await request(httpServer)
    .post("/api/v1/auth/register")
    .send({ email, password: "password123", name: "Test User", organizationName })
    .expect(201);
  const login = await request(httpServer).post("/api/v1/auth/login").send({ email, password: "password123" }).expect(200);
  return { token: login.body.accessToken as string, organizationId: login.body.organization.id as string };
}

async function connect(token: string, organizationId: string, join?: { projectId?: string; issueId?: string }) {
  const socket = ioClient(url, { auth: { token } });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });
  await new Promise<{ ok: boolean }>((resolve) => socket.emit("join:org", { organizationId }, resolve));
  if (join?.projectId) {
    await new Promise<{ ok: boolean }>((resolve) => socket.emit("join:project", { projectId: join.projectId }, resolve));
  }
  if (join?.issueId) {
    await new Promise<{ ok: boolean }>((resolve) =>
      socket.emit("join:issue", { projectId: join.projectId, issueId: join.issueId }, resolve),
    );
  }
  return socket;
}

/** Resolves with the first payload of `event`, or rejects after `ms`. */
function nextEvent<T>(socket: ClientSocket, event: string, ms = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms}ms`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** True if `event` does NOT arrive within `ms`. */
async function neverReceives(socket: ClientSocket, event: string, ms = 400): Promise<boolean> {
  let received = false;
  socket.once(event, () => {
    received = true;
  });
  await new Promise((resolve) => setTimeout(resolve, ms));
  return !received;
}

async function setup() {
  const owner = await registerAndLogIn("owner@example.com", "Org A");
  const auth = { Authorization: `Bearer ${owner.token}` };
  const orgBase = `/api/v1/organizations/${owner.organizationId}`;
  const project = await request(httpServer).post(`${orgBase}/projects`).set(auth).send({ name: "Website", key: "WEB" }).expect(201);
  const projectId = project.body.data.id as string;
  return { owner, auth, orgBase, projectId, projectBase: `${orgBase}/projects/${projectId}` };
}

describe("organization-wide broadcasts", () => {
  beforeEach(async () => {
    await resetDatabase();
    httpServer = createServer(app);
    attachSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("renaming a project tells the organization, and another organization hears nothing", async () => {
    // Catches: a rename that never reaches open tabs, or leaks into another tenant's room.
    const { owner, auth, projectBase } = await setup();
    const outsider = await registerAndLogIn("outsider@example.com", "Org B");
    const listener = await connect(owner.token, owner.organizationId);
    const stranger = await connect(outsider.token, outsider.organizationId);

    const heard = nextEvent<{ kind: string }>(listener, "org:changed");
    const strangerQuiet = neverReceives(stranger, "org:changed");
    await request(httpServer).patch(projectBase).set(auth).send({ name: "Marketing site" }).expect(200);

    expect(await heard).toEqual({ kind: "project" });
    expect(await strangerQuiet).toBe(true);
  });

  it("renaming and deleting a label tell the organization", async () => {
    const { owner, auth, orgBase } = await setup();
    const listener = await connect(owner.token, owner.organizationId);
    const label = await request(httpServer).post(`${orgBase}/labels`).set(auth).send({ name: "bug", color: "#112233" }).expect(201);

    const afterRename = nextEvent<{ kind: string }>(listener, "org:changed");
    await request(httpServer).patch(`${orgBase}/labels/${label.body.data.id}`).set(auth).send({ name: "defect" }).expect(200);
    expect(await afterRename).toEqual({ kind: "label" });

    const afterDelete = nextEvent<{ kind: string }>(listener, "org:changed");
    await request(httpServer).delete(`${orgBase}/labels/${label.body.data.id}`).set(auth).expect(204);
    expect(await afterDelete).toEqual({ kind: "label" });
  });

  it("renaming and deleting a sprint tell the organization which project", async () => {
    const { owner, auth, projectBase, projectId } = await setup();
    const listener = await connect(owner.token, owner.organizationId);
    const sprint = await request(httpServer).post(`${projectBase}/sprints`).set(auth).send({ name: "Sprint 1" }).expect(201);

    const afterRename = nextEvent<{ kind: string; projectId: string }>(listener, "org:changed");
    await request(httpServer)
      .patch(`${projectBase}/sprints/${sprint.body.data.id}`)
      .set(auth)
      .send({ version: sprint.body.data.version, name: "Launch" })
      .expect(200);
    expect(await afterRename).toEqual({ kind: "sprint", projectId });

    const afterDelete = nextEvent<{ kind: string; projectId: string }>(listener, "org:changed");
    await request(httpServer).delete(`${projectBase}/sprints/${sprint.body.data.id}`).set(auth).expect(204);
    expect(await afterDelete).toEqual({ kind: "sprint", projectId });
  });

  it("a refused rename (wrong role) broadcasts nothing", async () => {
    // Catches: broadcasting before the permission and validation outcome is known.
    const { owner, auth, projectBase } = await setup();
    const listener = await connect(owner.token, owner.organizationId);
    const quiet = neverReceives(listener, "org:changed");
    await request(httpServer).patch(projectBase).set(auth).send({ name: "" }).expect(400);
    expect(await quiet).toBe(true);
  });

  it("deleting a project tells the whole organization, not another one", async () => {
    const { owner, auth, projectBase, projectId } = await setup();
    const outsider = await registerAndLogIn("outsider@example.com", "Org B");
    const listener = await connect(owner.token, owner.organizationId);
    const stranger = await connect(outsider.token, outsider.organizationId);

    const heard = nextEvent<{ projectId: string }>(listener, "project:deleted");
    const strangerQuiet = neverReceives(stranger, "project:deleted");
    await request(httpServer).delete(projectBase).set(auth).send({ confirmName: "Website" }).expect(204);

    expect(await heard).toEqual({ projectId });
    expect(await strangerQuiet).toBe(true);
  });

  it("deleting an issue tells the issue room and the project room", async () => {
    // Catches: viewers of a deleted issue, or a board, never learning of it.
    const { owner, auth, projectBase, projectId } = await setup();
    const issue = await request(httpServer).post(`${projectBase}/issues`).set(auth).send({ title: "Doomed" }).expect(201);
    const issueId = issue.body.data.id as string;
    const inIssueRoom = await connect(owner.token, owner.organizationId, { projectId, issueId });
    const inProjectRoom = await connect(owner.token, owner.organizationId, { projectId });

    const heardInIssue = nextEvent<{ issueId: string }>(inIssueRoom, "issue:deleted");
    const heardInProject = nextEvent<{ issueId: string }>(inProjectRoom, "issue:deleted");
    await request(httpServer).delete(`${projectBase}/issues/${issueId}`).set(auth).expect(204);

    expect(await heardInIssue).toEqual({ issueId });
    expect(await heardInProject).toEqual({ issueId });
  });
});

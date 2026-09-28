import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { type Socket as ClientSocket, io as ioClient } from "socket.io-client";
import { app } from "../app.js";
import { db } from "../db/client.js";
import { resetDatabase } from "../db/test-utils.js";
import { organizationMembers, users } from "../db/schema/index.js";
import { signAccessToken } from "../modules/auth/tokens.js";
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

/**
 * join:issue relies on socket.data.organizationId the same way
 * join:project does — connects, joins org, then joins the given issue,
 * and returns the connected socket.
 */
async function connectAndJoinIssue(
  accessToken: string,
  organizationId: string,
  projectId: string,
  issueId: string,
): Promise<ClientSocket> {
  const socket = ioClient(url, { auth: { token: accessToken } });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });
  await new Promise<{ ok: boolean }>((resolve) => socket.emit("join:org", { organizationId }, resolve));
  await new Promise<{ ok: boolean }>((resolve) => socket.emit("join:issue", { projectId, issueId }, resolve));
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

describe("broadcast into the issue room", () => {
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

  it("broadcasts issue:commented into the issue room when a comment is posted", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Commentable");

    const socket = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issue.id);
    clients.push(socket);

    const received = new Promise<{ issueId: string }>((resolve) => {
      socket.on("issue:commented", resolve);
    });

    await request(httpServer)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/comments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ body: "Looking into this" })
      .expect(201);

    const event = await received;
    expect(event).toEqual({ issueId: issue.id });
  });

  it("also broadcasts issue:changed into the issue room (not just the project room) on a move", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Movable");

    // This socket only ever joins the issue room, never the project room.
    const socket = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issue.id);
    clients.push(socket);

    const received = new Promise<{ issueId: string }>((resolve) => {
      socket.on("issue:changed", resolve);
    });

    await request(httpServer)
      .patch(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/move`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ version: issue.version, status: "done" })
      .expect(200);

    const event = await received;
    expect(event).toEqual({ issueId: issue.id });
  });

  it("never broadcasts a comment into a project room — only the issue room", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Commentable");

    const projectSocket = await connectAndJoinProject(userA.accessToken, userA.organizationId, projectId);
    clients.push(projectSocket);

    let receivedComment = false;
    projectSocket.on("issue:commented", () => {
      receivedComment = true;
    });

    await request(httpServer)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/comments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ body: "Should not reach the board" })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedComment).toBe(false);
  });

  it("never broadcasts one issue's events into another issue's room", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issueA = await createIssue(userA.accessToken, userA.organizationId, projectId, "A");
    const issueB = await createIssue(userA.accessToken, userA.organizationId, projectId, "B");

    const socketB = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issueB.id);
    clients.push(socketB);

    let receivedByB = false;
    socketB.on("issue:commented", () => {
      receivedByB = true;
    });

    await request(httpServer)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issueA.id}/comments`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ body: "On issue A, not B" })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedByB).toBe(false);
  });

  it("rejects join:issue for an issue outside the caller's own org/project", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const userB = await registerAndLogIn("b@example.com", "Org B");
    const projectA = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const projectB = await createProject(userB.accessToken, userB.organizationId, "BBB");
    const issueB = await createIssue(userB.accessToken, userB.organizationId, projectB, "In B");

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
      socketA.emit("join:issue", { projectId: projectA, issueId: issueB.id }, resolve);
    });

    expect(ack.ok).toBe(false);
  });
});

/**
 * There's no invite flow yet (Phase 2 — every registration creates its
 * own personal org), so a second real member of userA's *same* org
 * can't be produced through the public API the way registerAndLogIn's
 * users are — seeded directly instead, same pattern
 * socket-server.test.ts already uses. signAccessToken sidesteps needing
 * a real password hash for a user this test never logs in through HTTP.
 */
async function addSecondUserToOrg(organizationId: string, name: string) {
  const [user] = await db
    .insert(users)
    .values({ email: `${name.toLowerCase().replace(" ", "-")}@example.com`, passwordHash: "not-a-real-hash", name })
    .returning();
  if (!user) throw new Error("setup failed");
  await db.insert(organizationMembers).values({ organizationId, userId: user.id, role: "member" });
  return { accessToken: signAccessToken(user.id), userId: user.id };
}

describe("presence on the issue room", () => {
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

  it("broadcasts presence:update including the new viewer on join", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Viewable");

    const socket = ioClient(url, { auth: { token: userA.accessToken } });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    await new Promise<{ ok: boolean }>((resolve) =>
      socket.emit("join:org", { organizationId: userA.organizationId }, resolve),
    );

    const received = new Promise<{ issueId: string; viewers: { userId: string; name: string }[] }>((resolve) => {
      socket.on("presence:update", resolve);
    });

    await new Promise<{ ok: boolean }>((resolve) =>
      socket.emit("join:issue", { projectId, issueId: issue.id }, resolve),
    );

    const event = await received;
    expect(event.issueId).toBe(issue.id);
    expect(event.viewers).toHaveLength(1);
    expect(event.viewers[0]?.name).toBe("Test User");
  });

  it("broadcasts the viewer's removal when they leave:issue", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Viewable");
    const userB = await addSecondUserToOrg(userA.organizationId, "Second Viewer");

    const socketA = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issue.id);
    clients.push(socketA);
    const socketB = await connectAndJoinIssue(userB.accessToken, userA.organizationId, projectId, issue.id);
    clients.push(socketB);

    const received = new Promise<{ viewers: { userId: string; name: string }[] }>((resolve) => {
      socketB.on("presence:update", resolve);
    });

    socketA.emit("leave:issue", { issueId: issue.id });

    const event = await received;
    expect(event.viewers).toHaveLength(1);
    expect(event.viewers[0]?.userId).toBe(userB.userId);
  });

  it("broadcasts the viewer's removal on a real disconnect, not just leave:issue", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Viewable");
    const userB = await addSecondUserToOrg(userA.organizationId, "Second Viewer");

    const socketA = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issue.id);
    clients.push(socketA);
    const socketB = await connectAndJoinIssue(userB.accessToken, userA.organizationId, projectId, issue.id);
    clients.push(socketB);

    const received = new Promise<{ viewers: { userId: string; name: string }[] }>((resolve) => {
      socketB.on("presence:update", resolve);
    });

    socketA.disconnect();

    const event = await received;
    expect(event.viewers).toHaveLength(1);
    expect(event.viewers[0]?.userId).toBe(userB.userId);
  });

  it("dedupes two tabs from the same user into one presence entry", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Viewable");

    const tabOne = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issue.id);
    clients.push(tabOne);

    const received = new Promise<{ viewers: { userId: string; name: string }[] }>((resolve) => {
      tabOne.on("presence:update", resolve);
    });

    // A second connection with the *same* access token — the same user,
    // a second tab.
    const tabTwo = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issue.id);
    clients.push(tabTwo);

    const event = await received;
    expect(event.viewers).toHaveLength(1);
  });

  it("never broadcasts presence from one issue into another issue's room", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issueA = await createIssue(userA.accessToken, userA.organizationId, projectId, "A");
    const issueB = await createIssue(userA.accessToken, userA.organizationId, projectId, "B");

    const socketB = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issueB.id);
    clients.push(socketB);

    let receivedByB = false;
    socketB.on("presence:update", () => {
      receivedByB = true;
    });

    const socketA = await connectAndJoinIssue(userA.accessToken, userA.organizationId, projectId, issueA.id);
    clients.push(socketA);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedByB).toBe(false);
  });
});

/**
 * user:{userId} is auto-joined on connect (see socket-server.ts) — no
 * join:* event needed, unlike org/project/issue. See the Phase 7 slice
 * 3 plan's "Decisions" for why: your own notifications are always
 * wanted regardless of what page you're on.
 */
describe("broadcast into the user's own notification room", () => {
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

  it("notifies the reporter when a real second org member comments, live", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Reported by A");
    const userB = await addSecondUserToOrg(userA.organizationId, "Commenter B");

    const socketA = ioClient(url, { auth: { token: userA.accessToken } });
    clients.push(socketA);
    await new Promise<void>((resolve, reject) => {
      socketA.on("connect", () => resolve());
      socketA.on("connect_error", reject);
    });

    const received = new Promise<void>((resolve) => socketA.on("notification:created", () => resolve()));

    await request(httpServer)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/comments`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ body: "A real comment from a real second user" })
      .expect(201);

    await received;
  });

  it("never notifies the commenter of their own comment", async () => {
    const userA = await registerAndLogIn("a@example.com", "Org A");
    const projectId = await createProject(userA.accessToken, userA.organizationId, "AAA");
    const issue = await createIssue(userA.accessToken, userA.organizationId, projectId, "Reported by A");
    const userB = await addSecondUserToOrg(userA.organizationId, "Commenter B");

    const socketB = ioClient(url, { auth: { token: userB.accessToken } });
    clients.push(socketB);
    await new Promise<void>((resolve, reject) => {
      socketB.on("connect", () => resolve());
      socketB.on("connect_error", reject);
    });

    let receivedByB = false;
    socketB.on("notification:created", () => {
      receivedByB = true;
    });

    await request(httpServer)
      .post(`/api/v1/organizations/${userA.organizationId}/projects/${projectId}/issues/${issue.id}/comments`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ body: "Commenting on my own — well, A's — issue" })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedByB).toBe(false);
  });
});

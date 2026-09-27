import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Socket as ClientSocket, io as ioClient } from "socket.io-client";
import { type Server as IOServer } from "socket.io";
import { db } from "../db/client.js";
import { resetDatabase } from "../db/test-utils.js";
import { organizationMembers, organizations, users } from "../db/schema/index.js";
import { signAccessToken } from "../modules/auth/tokens.js";
import { attachSocketServer } from "./socket-server.js";

/**
 * A real http.Server on an ephemeral port, not the app's own — same
 * attachSocketServer() production wiring uses (index.ts), so this test
 * can never silently diverge from what actually runs. Auth and
 * membership checks working correctly over a real socket connection,
 * not HTTP, is new territory for this codebase — "prove it, don't
 * assume" applies here the same as everywhere else.
 */
describe("socket server", () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: IOServer;
  let url: string;
  let client: ClientSocket | undefined;

  beforeEach(async () => {
    await resetDatabase();
    httpServer = createServer();
    io = attachSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    client?.disconnect();
    client = undefined;
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function seedUserAndOrg() {
    const [org] = await db.insert(organizations).values({ name: "Org", slug: "org" }).returning();
    if (!org) throw new Error("setup failed");
    const [user] = await db
      .insert(users)
      .values({ email: "socket@example.com", passwordHash: "not-a-real-hash", name: "Socket User" })
      .returning();
    if (!user) throw new Error("setup failed");
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "owner" });
    return { org, user };
  }

  it("accepts a connection with a valid access token", async () => {
    const { user } = await seedUserAndOrg();
    const token = signAccessToken(user.id);

    client = ioClient(url, { auth: { token } });
    await new Promise<void>((resolve, reject) => {
      client?.on("connect", () => resolve());
      client?.on("connect_error", reject);
    });

    expect(client.connected).toBe(true);
  });

  it("rejects a connection with no access token", async () => {
    client = ioClient(url, { auth: {} });

    const error = await new Promise<Error>((resolve) => {
      client?.on("connect_error", resolve);
    });

    expect(error.message).toMatch(/access token/i);
    expect(client.connected).toBe(false);
  });

  it("rejects a connection with a garbage access token", async () => {
    client = ioClient(url, { auth: { token: "not-a-real-token" } });

    const error = await new Promise<Error>((resolve) => {
      client?.on("connect_error", resolve);
    });

    expect(error.message).toMatch(/invalid or expired/i);
  });

  it("joins the org room when the caller is a real member", async () => {
    const { org, user } = await seedUserAndOrg();
    const token = signAccessToken(user.id);

    client = ioClient(url, { auth: { token } });
    await new Promise<void>((resolve) => client?.on("connect", resolve));

    const ack = await new Promise<{ ok: boolean }>((resolve) => {
      client?.emit("join:org", { organizationId: org.id }, resolve);
    });

    expect(ack).toEqual({ ok: true });
  });

  it("refuses to join an org the caller isn't a member of", async () => {
    const { user } = await seedUserAndOrg();
    const [otherOrg] = await db.insert(organizations).values({ name: "Other", slug: "other" }).returning();
    if (!otherOrg) throw new Error("setup failed");
    const token = signAccessToken(user.id);

    client = ioClient(url, { auth: { token } });
    await new Promise<void>((resolve) => client?.on("connect", resolve));

    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      client?.emit("join:org", { organizationId: otherOrg.id }, resolve);
    });

    expect(ack).toEqual({ ok: false, error: "not_a_member" });
  });
});

import type { Server as HttpServer } from "node:http";
import { Server, type DefaultEventsMap } from "socket.io";
import { verifyAccessToken } from "../modules/auth/tokens.js";
import { findUserById } from "../modules/auth/auth.repository.js";
import * as organizationsRepository from "../modules/organizations/organizations.repository.js";
import * as projectsRepository from "../modules/projects/projects.repository.js";
import * as issuesRepository from "../modules/issues/issues.repository.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

// The 4th Server/Socket generic — what socket.data holds. Set once in
// the auth middleware / join:org handler below, read everywhere after.
// Typing it this way (not a `declare module` augmentation) is socket.io's
// own documented mechanism for this, and avoids fighting the library's
// generics. organizationId is the socket-side equivalent of
// req.ctx.organizationId — null until a successful join:org sets it,
// which join:project then relies on the same way requireProject relies
// on requireOrgMembership having already run. name is lazily fetched and
// cached the first time join:issue actually needs it for presence — not
// fetched eagerly in the auth middleware, which would cost every
// connection a DB read even for sessions that never open an issue.
interface SocketData {
  userId: string;
  organizationId: string | null;
  name: string | null;
}

type IOServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

type JoinOrgAck = { ok: true } | { ok: false; error: "invalid_organization_id" | "not_a_member" };
type JoinProjectAck =
  | { ok: true }
  | { ok: false; error: "invalid_project_id" | "not_in_org" | "project_not_found" };
type JoinIssueAck =
  | { ok: true }
  | { ok: false; error: "invalid_project_id" | "invalid_issue_id" | "not_in_org" | "issue_not_found" };

// Module-level singleton, set once attachSocketServer() runs — same
// pattern db/client.ts already uses for its own singleton. null in any
// process that never called attachSocketServer() (every HTTP-level
// test, which drives app.ts directly via supertest with no real
// http.Server) — broadcastIssueChanged degrades to a safe no-op in that
// case, which is the correct behavior, not a workaround: there is
// genuinely nothing to broadcast to.
let ioInstance: IOServer | null = null;

type PresenceViewer = { userId: string; name: string };

// issueId -> (socketId -> viewer). Keyed by socketId, not userId, so two
// tabs from the same person are tracked independently — closing one
// correctly leaves the other's presence intact. Ephemeral, in-memory
// only: presence has no DB table and writes no issue_events row, unlike
// every other piece of real-time data in this app so far.
const issuePresence = new Map<string, Map<string, PresenceViewer>>();

/** Deduped by userId — two tabs from the same person show as one entry,
 * not "Alice, Alice". */
function broadcastPresence(issueId: string) {
  const viewers = issuePresence.get(issueId);
  const byUserId = new Map<string, PresenceViewer>();
  if (viewers) {
    for (const viewer of viewers.values()) byUserId.set(viewer.userId, viewer);
  }
  ioInstance
    ?.to(`issue:${issueId}`)
    .emit("presence:update", { issueId, viewers: [...byUserId.values()] });
}

function addPresence(issueId: string, socketId: string, viewer: PresenceViewer) {
  let viewers = issuePresence.get(issueId);
  if (!viewers) {
    viewers = new Map();
    issuePresence.set(issueId, viewers);
  }
  viewers.set(socketId, viewer);
  broadcastPresence(issueId);
}

function removePresence(issueId: string, socketId: string) {
  const viewers = issuePresence.get(issueId);
  if (!viewers?.delete(socketId)) return; // wasn't present — no real change, no broadcast
  if (viewers.size === 0) issuePresence.delete(issueId);
  broadcastPresence(issueId);
}

/** Called on disconnect — a socket's own state doesn't track which
 * issue room(s) it's in, so this scans every currently-tracked issue.
 * Fine at this app's real scale (a handful of concurrently-viewed
 * issues, not thousands); removePresence is a safe no-op for any issue
 * this socket wasn't actually present in. */
function removePresenceFromAll(socketId: string) {
  for (const issueId of [...issuePresence.keys()]) {
    removePresence(issueId, socketId);
  }
}

/**
 * Wires auth + room-joining onto a real http.Server and returns the io
 * instance. A pure function of the server it's given (not a side effect
 * of importing this module) so index.ts and this slice's own tests can
 * all call it — production and test auth can never drift apart into two
 * different implementations. Also stashes the created server as the
 * module-level singleton broadcastIssueChanged() reads.
 */
export function attachSocketServer(httpServer: HttpServer): IOServer {
  const io: IOServer = new Server(httpServer, {
    cors: { origin: env.APP_URL },
  });
  ioInstance = io;

  // Same token requireAuth checks (apps/api/src/middleware/require-auth.ts)
  // — verifyAccessToken() is already a plain function, not Express-
  // specific, so there's nothing to adapt beyond how the error surfaces.
  // next(new Error(...)) is Socket.IO's own rejection mechanism: the
  // client gets a connect_error, not an HTTP response, so there's no
  // AppError status/code shape to reuse here.
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as unknown;
    if (typeof token !== "string") {
      logger.warn({ socketId: socket.id }, "socket handshake rejected — missing access token");
      next(new Error("Missing access token"));
      return;
    }

    try {
      const { userId } = verifyAccessToken(token);
      socket.data = { userId, organizationId: null, name: null };
      next();
    } catch {
      logger.warn({ socketId: socket.id }, "socket handshake rejected — invalid or expired access token");
      next(new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket) => {
    logger.info({ userId: socket.data.userId, socketId: socket.id }, "socket connected");

    // Auto-joined, not a client-emitted join:* like org/project/issue —
    // those are page-scoped (you only care about a project's traffic
    // while looking at it); your own notifications are always wanted
    // regardless of what page you're on. socket.data.userId is already
    // verified at handshake time, so no extra membership check is
    // needed the way join:org's is.
    void socket.join(`user:${socket.data.userId}`);

    socket.on(
      "join:org",
      async (payload: unknown, ack: (response: JoinOrgAck) => void) => {
        const organizationId =
          typeof payload === "object" && payload !== null
            ? (payload as { organizationId?: unknown }).organizationId
            : undefined;

        if (typeof organizationId !== "string") {
          ack({ ok: false, error: "invalid_organization_id" });
          return;
        }

        const membership = await organizationsRepository.findMembership(
          socket.data.userId,
          organizationId,
        );

        if (!membership) {
          logger.warn(
            { userId: socket.data.userId, organizationId },
            "socket join:org rejected — not a member",
          );
          ack({ ok: false, error: "not_a_member" });
          return;
        }

        await socket.join(`org:${organizationId}`);
        // Remembered for join:project below — the socket-side
        // equivalent of req.ctx.organizationId, set once membership is
        // actually proven rather than trusted from a later event's
        // own payload.
        socket.data.organizationId = organizationId;
        logger.info({ userId: socket.data.userId, organizationId }, "socket joined org room");
        ack({ ok: true });
      },
    );

    socket.on(
      "join:project",
      async (payload: unknown, ack: (response: JoinProjectAck) => void) => {
        const projectId =
          typeof payload === "object" && payload !== null
            ? (payload as { projectId?: unknown }).projectId
            : undefined;

        if (typeof projectId !== "string") {
          ack({ ok: false, error: "invalid_project_id" });
          return;
        }

        if (!socket.data.organizationId) {
          ack({ ok: false, error: "not_in_org" });
          return;
        }

        const project = await projectsRepository.findById(socket.data.organizationId, projectId);
        if (!project) {
          logger.warn(
            { userId: socket.data.userId, projectId },
            "socket join:project rejected — project not found in caller's org",
          );
          ack({ ok: false, error: "project_not_found" });
          return;
        }

        await socket.join(`project:${projectId}`);
        logger.info({ userId: socket.data.userId, projectId }, "socket joined project room");
        ack({ ok: true });
      },
    );

    socket.on("leave:project", (payload: unknown) => {
      const projectId =
        typeof payload === "object" && payload !== null
          ? (payload as { projectId?: unknown }).projectId
          : undefined;
      if (typeof projectId === "string") {
        void socket.leave(`project:${projectId}`);
      }
    });

    socket.on(
      "join:issue",
      async (payload: unknown, ack: (response: JoinIssueAck) => void) => {
        const body = typeof payload === "object" && payload !== null ? payload : {};
        const projectId = (body as { projectId?: unknown }).projectId;
        const issueId = (body as { issueId?: unknown }).issueId;

        if (typeof projectId !== "string") {
          ack({ ok: false, error: "invalid_project_id" });
          return;
        }
        if (typeof issueId !== "string") {
          ack({ ok: false, error: "invalid_issue_id" });
          return;
        }
        if (!socket.data.organizationId) {
          ack({ ok: false, error: "not_in_org" });
          return;
        }

        // Same check requireIssue runs over HTTP — never trust the
        // client-claimed project/issue ids alone.
        const issue = await issuesRepository.findById(socket.data.organizationId, projectId, issueId);
        if (!issue) {
          logger.warn(
            { userId: socket.data.userId, projectId, issueId },
            "socket join:issue rejected — issue not found in caller's org/project",
          );
          ack({ ok: false, error: "issue_not_found" });
          return;
        }

        await socket.join(`issue:${issueId}`);
        logger.info({ userId: socket.data.userId, issueId }, "socket joined issue room");

        // Lazily fetched and cached on socket.data — only sessions that
        // actually open an issue ever pay this DB read, and only once
        // per connection even if they hop between several issues.
        if (socket.data.name === null) {
          const user = await findUserById(socket.data.userId);
          socket.data.name = user?.name ?? "Unknown";
        }
        addPresence(issueId, socket.id, { userId: socket.data.userId, name: socket.data.name });

        ack({ ok: true });
      },
    );

    socket.on("leave:issue", (payload: unknown) => {
      const issueId =
        typeof payload === "object" && payload !== null
          ? (payload as { issueId?: unknown }).issueId
          : undefined;
      if (typeof issueId === "string") {
        void socket.leave(`issue:${issueId}`);
        removePresence(issueId, socket.id);
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info({ userId: socket.data.userId, socketId: socket.id, reason }, "socket disconnected");
      removePresenceFromAll(socket.id);
    });
  });

  return io;
}

/**
 * Broadcasts "this issue changed, go refetch" to everyone currently
 * viewing this project's board/list *or* this exact issue's detail page
 * — called from issues.service.ts after a create/update/move commits.
 * Chaining .to() unions the target rooms (a socket in both gets one
 * copy, not two), so this is one broadcast reaching two audiences, not
 * two broadcasts to keep in sync. Silently no-ops when no socket server
 * is attached (every HTTP-level test): there is genuinely nothing to
 * broadcast to in that case, not a failure to report.
 */
export function broadcastIssueChanged(projectId: string, issueId: string): void {
  ioInstance
    ?.to(`project:${projectId}`)
    .to(`issue:${issueId}`)
    .emit("issue:changed", { issueId });
}

/**
 * Something shared by the whole organization was renamed, recoloured or removed
 * (a project, a label, a sprint). Sent to the organization room, where every
 * connected member already is, so any open tab refetches the matching list
 * instead of staying stale until it happens to be focused. The payload only says
 * WHAT kind of thing changed (and which project, for sprints): the client refetches
 * through the normal endpoints, which keeps tenant scoping in one place.
 */
export type OrganizationChange = { kind: "project" } | { kind: "label" } | { kind: "sprint"; projectId: string };

export function broadcastOrganizationChanged(organizationId: string, change: OrganizationChange): void {
  ioInstance?.to(`org:${organizationId}`).emit("org:changed", change);
}

/**
 * A project was hard-deleted (ADR 0022). Sent to the whole organization room, not
 * just the project room: people who are not looking at the project (the sidebar,
 * the projects list) need to drop it too, and people who are need to be sent away.
 */
export function broadcastProjectDeleted(organizationId: string, projectId: string): void {
  ioInstance?.to(`org:${organizationId}`).emit("project:deleted", { projectId });
}

/**
 * An issue was hard-deleted (ADR 0022). Goes to the issue room (so anyone
 * looking at it can be sent back to the list instead of seeing "not found") and
 * to the project room (so boards and lists drop the card). A distinct event from
 * issue:changed: a refetch of a deleted issue would be a 404.
 */
export function broadcastIssueDeleted(projectId: string, issueId: string): void {
  ioInstance?.to(`project:${projectId}`).to(`issue:${issueId}`).emit("issue:deleted", { issueId });
}

/**
 * Comments never render on the board/list, so this only reaches
 * issue:{id} — a project-room viewer has no reason to hear about a
 * comment on an issue they aren't looking at. A distinct event from
 * issue:changed (not reused) mirrors the domain event system already
 * distinguishing issue.commented from issue.updated/issue.moved, even
 * though the client's reaction to either on the detail page is the
 * same invalidation.
 */
export function broadcastIssueCommented(issueId: string): void {
  ioInstance?.to(`issue:${issueId}`).emit("issue:commented", { issueId });
}

/**
 * Bare event, no payload — unlike issue:changed/issue:commented, the
 * client can't cheaply already have the right list cached locally, so
 * there's nothing to usefully attach anyway. The receiving client just
 * invalidates its notifications list + unread-count queries and re-
 * fetches via the real REST endpoints, same "just refetch" precedent
 * useLiveIssueUpdates already uses for issue:changed — avoids
 * duplicating notifications.repository.ts's join logic in the payload.
 */
export function broadcastNotificationCreated(userId: string): void {
  ioInstance?.to(`user:${userId}`).emit("notification:created");
}

import type { Server as HttpServer } from "node:http";
import { Server, type DefaultEventsMap } from "socket.io";
import { verifyAccessToken } from "../modules/auth/tokens.js";
import * as organizationsRepository from "../modules/organizations/organizations.repository.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

// The 4th Server/Socket generic — what socket.data holds. Set once in
// the auth middleware below, read everywhere after. Typing it this way
// (not a `declare module` augmentation) is socket.io's own documented
// mechanism for this, and avoids fighting the library's generics.
interface SocketData {
  userId: string;
}

type IOServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

type JoinOrgAck = { ok: true } | { ok: false; error: "invalid_organization_id" | "not_a_member" };

/**
 * Wires auth + room-joining onto a real http.Server and returns the io
 * instance. A pure function of the server it's given (not a side effect
 * of importing this module) so index.ts and this slice's own test can
 * both call it — production and test auth can never drift apart into two
 * different implementations. No module-level getIO() singleton yet:
 * nothing needs to .emit() from elsewhere until slice 2, and that's slice
 * 2's decision to make with a real caller in hand, not guessed at now.
 */
export function attachSocketServer(httpServer: HttpServer): IOServer {
  const io: IOServer = new Server(httpServer, {
    cors: { origin: env.APP_URL },
  });

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
      socket.data = { userId };
      next();
    } catch {
      logger.warn({ socketId: socket.id }, "socket handshake rejected — invalid or expired access token");
      next(new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket) => {
    logger.info({ userId: socket.data.userId, socketId: socket.id }, "socket connected");

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
        logger.info({ userId: socket.data.userId, organizationId }, "socket joined org room");
        ack({ ok: true });
      },
    );

    socket.on("disconnect", (reason) => {
      logger.info({ userId: socket.data.userId, socketId: socket.id, reason }, "socket disconnected");
    });
  });

  return io;
}

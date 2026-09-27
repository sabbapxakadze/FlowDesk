import { io, type Socket } from "socket.io-client";
import { getStoredAccessToken } from "../auth/token-store";

/**
 * A plain module-level variable, not React state — same reasoning as
 * token-store.ts: later slices' hooks need to reach the live socket from
 * outside a component tree the same way shared/api/client.ts's fetch
 * wrapper reaches the stored access token.
 */
let socket: Socket | null = null;

/**
 * Connects once per login and re-authenticates on every reconnect, not
 * just the first connect: `auth` is a function here, not a static
 * object, so socket.io-client calls it fresh on every (re)connection
 * attempt — picking up whatever token-store.ts currently holds. That's
 * what lets a connection survive past the access token's 15-minute
 * expiry with no new refresh logic of its own: a reconnect just reads
 * the token the existing HTTP refresh flow already kept current.
 *
 * join:org is re-emitted on every "connect" (including reconnects)
 * because Socket.IO room membership doesn't survive a new underlying
 * connection — only the room name does, here, as a closure.
 */
export function connectSocket(organizationId: string): void {
  socket?.disconnect();

  socket = io({
    auth: (cb) => cb({ token: getStoredAccessToken() }),
  });

  socket.on("connect", () => {
    socket?.emit("join:org", { organizationId }, (ack: { ok: boolean; error?: string }) => {
      if (!ack.ok) {
        console.error("Failed to join org room", ack.error);
      }
    });
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection failed", error.message);
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

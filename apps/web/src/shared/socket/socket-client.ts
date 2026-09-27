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
 * Resolves once the *current* connection's join:org round-trip finishes
 * (successfully or not) — pending again from the instant the connection
 * drops until the next reconnect's join:org completes. This exists
 * because of a real bug caught live while building Phase 6 slice 2: a
 * page-scoped join:project (see
 * entities/issue/api/useLiveIssueUpdates.ts) fired on mount, and on a
 * fresh page load it could reach the server before join:org's own ack
 * had actually set socket.data.organizationId — rejected with
 * not_in_org even though the client "did everything right."
 *
 * The first version of this fix only reset the promise *inside* the
 * "connect" handler, which left the exact same gap open between calling
 * connectSocket() and the socket actually connecting: a caller in that
 * window read the stale already-resolved default and raced ahead again.
 * resetOrgReady() is called synchronously in connectSocket() itself (no
 * gap before the first connect) and again on every "disconnect" (room
 * membership is gone the instant a connection drops, so readiness has
 * to become pending again at that exact moment, not just on the next
 * "connect"). Anything that depends on the org room already being
 * joined must await whenOrgRoomReady(), not just check
 * `socket?.connected`.
 */
let orgReady: Promise<void> = Promise.resolve();
let resolveOrgReady: (() => void) | null = null;

function resetOrgReady() {
  orgReady = new Promise((resolve) => {
    resolveOrgReady = resolve;
  });
}

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

  const s = io({
    auth: (cb) => cb({ token: getStoredAccessToken() }),
  });
  socket = s;
  resetOrgReady();

  s.on("connect", () => {
    s.emit("join:org", { organizationId }, (ack: { ok: boolean; error?: string }) => {
      if (!ack.ok) {
        console.error("Failed to join org room", ack.error);
      }
      // Resolves either way: a failed join is a real, ack'd outcome
      // callers should still proceed past, not hang on forever.
      resolveOrgReady?.();
    });
  });

  s.on("disconnect", resetOrgReady);

  s.on("connect_error", (error) => {
    console.error("Socket connection failed", error.message);
  });
}

export function whenOrgRoomReady(): Promise<void> {
  return orgReady;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

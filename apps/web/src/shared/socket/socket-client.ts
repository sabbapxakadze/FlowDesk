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
 * Whether the *current* connection's join:org round-trip has finished.
 * This exists because of a real bug caught live while building Phase 6
 * slice 2: a page-scoped join:project (see
 * entities/issue/api/useLiveIssueUpdates.ts) fired on mount, and on a
 * fresh page load it could reach the server before join:org's own ack
 * had actually set socket.data.organizationId — rejected with
 * not_in_org even though the client "did everything right."
 *
 * Two earlier versions of this fix both used a single swapped-out
 * Promise instance (reset inside the "connect" handler, then reset
 * again on every "connect"/"disconnect" to cover the gap before the
 * first connect) — both still had the same underlying flaw: a caller
 * that already grabbed a reference to the *old* pending promise via
 * .then() never gets woken up once that promise is silently replaced
 * by a new one, because reassigning the module variable doesn't affect
 * a .then() chain already attached to the old instance. Caught live
 * (again) building slice 3: React StrictMode's dev-only rapid
 * connect/disconnect churn on a fresh page load made this the common
 * case, not an edge case — a direct, hook-free manual join:issue call
 * (no intervening disconnect) worked every time; the app's own hook
 * did not.
 *
 * The fix is a resolver *queue*, not a single swapped Promise: readiness
 * is a plain boolean, and whenOrgRoomReady() either resolves immediately
 * (already ready) or queues a resolver to be drained the next time
 * markOrgRoomReady() runs — correct no matter how many connect/
 * disconnect cycles happen between a caller asking and readiness
 * actually being achieved, since no single promise identity is ever
 * silently orphaned.
 */
let orgRoomReady = false;
let pendingOrgRoomResolvers: Array<() => void> = [];

function markOrgRoomReady() {
  orgRoomReady = true;
  const resolvers = pendingOrgRoomResolvers;
  pendingOrgRoomResolvers = [];
  for (const resolve of resolvers) resolve();
}

function markOrgRoomNotReady() {
  orgRoomReady = false;
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
  markOrgRoomNotReady();

  s.on("connect", () => {
    s.emit("join:org", { organizationId }, (ack: { ok: boolean; error?: string }) => {
      if (!ack.ok) {
        console.error("Failed to join org room", ack.error);
      }
      // Marked ready either way: a failed join is a real, ack'd outcome
      // callers should still proceed past, not hang on forever.
      markOrgRoomReady();
    });
  });

  s.on("disconnect", markOrgRoomNotReady);

  s.on("connect_error", (error) => {
    console.error("Socket connection failed", error.message);
  });
}

export function whenOrgRoomReady(): Promise<void> {
  if (orgRoomReady) return Promise.resolve();
  return new Promise((resolve) => {
    pendingOrgRoomResolvers.push(resolve);
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

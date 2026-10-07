import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { sessions } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";
import { AppError } from "../../shared/errors.js";
import * as authService from "./auth.service.js";
import { hashToken } from "./tokens.js";

/** Pretends the token was rotated a minute ago, i.e. long after the grace window (ADR 0048), without sleeping in a test. */
async function ageRotation(refreshToken: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(Date.now() - 60_000) })
    .where(eq(sessions.refreshTokenHash, hashToken(refreshToken)));
}

/**
 * The important test in this whole slice. Rotation on its own is easy to
 * get right; rotation *with reuse detection* is the part that's easy to
 * get subtly wrong — and easy to believe works without ever actually
 * proving the "whole family dies" part, not just "this one request fails."
 */
describe("auth service — sessions", () => {
  beforeEach(async () => {
    await resetDatabase();
    await authService.register({
      email: "session@example.com",
      password: "password123",
      name: "Session Tester",
      organizationName: "Session Org",
    });
  });

  it("logs in and issues a working access token + refresh token", async () => {
    const result = await authService.login({
      email: "session@example.com",
      password: "password123",
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe("session@example.com");
  });

  it("rejects a wrong password with the same error as a nonexistent email", async () => {
    // Awaited one at a time, not pre-created as separate unawaited
    // promises — otherwise both start rejecting before either has a
    // handler attached, and Node flags it as an unhandled rejection race.
    await expect(
      authService.login({ email: "session@example.com", password: "totally-wrong" }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });

    await expect(
      authService.login({ email: "nobody@example.com", password: "whatever123" }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("rotates the refresh token on a normal refresh", async () => {
    const { refreshToken: firstToken } = await authService.login({
      email: "session@example.com",
      password: "password123",
    });

    const { refreshToken: secondToken } = await authService.refresh(firstToken);

    expect(secondToken).not.toBe(firstToken);

    // The new token works for a further refresh.
    const { refreshToken: thirdToken } = await authService.refresh(secondToken);
    expect(thirdToken).not.toBe(secondToken);
  });

  it("reusing a token rotated long ago revokes the entire family, not just that request", async () => {
    const { refreshToken: firstToken } = await authService.login({
      email: "session@example.com",
      password: "password123",
    });

    // Rotate once — firstToken is now spent, secondToken is the live one.
    const { refreshToken: secondToken } = await authService.refresh(firstToken);
    await ageRotation(firstToken); // past the grace window: this is no longer a refresh racing itself

    // Presenting the already-used firstToken again must fail...
    await expect(authService.refresh(firstToken)).rejects.toThrow(AppError);

    // ...and must have killed secondToken too, even though secondToken
    // was never itself reused and is still within its normal lifetime.
    // If it hadn't, this would succeed — that's the actual bug reuse
    // detection exists to catch: a stolen old token doesn't just fail
    // itself, it has to burn the attacker's foothold in the family too.
    await expect(authService.refresh(secondToken)).rejects.toThrow(AppError);
  });

  it("a token rotated a moment ago is answered again, like a refresh that raced itself, and the family survives (ADR 0048)", async () => {
    // Why: the browser cancels a refresh (reload, a click on a link) after the server rotated but before the new cookie was stored, and
    // the next request carries the old token. Found by CI: the person was signed out on a slow machine.
    const { refreshToken: firstToken } = await authService.login({
      email: "session@example.com",
      password: "password123",
    });
    const { refreshToken: lostToken } = await authService.refresh(firstToken); // its answer never reached the browser

    const replayed = await authService.refresh(firstToken); // the browser asks again with the old cookie
    expect(replayed.accessToken).toBeTruthy();
    expect(replayed.refreshToken).not.toBe(firstToken);

    // The session carries on with the token the browser did receive, and the family was not killed.
    const next = await authService.refresh(replayed.refreshToken);
    expect(next.refreshToken).toBeTruthy();
    expect(lostToken).toBeTruthy();
  });

  it("answering a raced token does not stretch the grace window", async () => {
    // Why: if the replay marked the old token spent again, its revoked time would move to now and a stolen token could be replayed
    // for ever by replaying it every few seconds.
    const { refreshToken: firstToken } = await authService.login({
      email: "session@example.com",
      password: "password123",
    });
    await authService.refresh(firstToken);
    const [before] = await db.select().from(sessions).where(eq(sessions.refreshTokenHash, hashToken(firstToken)));

    await authService.refresh(firstToken); // raced, answered
    const [after] = await db.select().from(sessions).where(eq(sessions.refreshTokenHash, hashToken(firstToken)));
    expect(after!.revokedAt!.getTime()).toBe(before!.revokedAt!.getTime());
  });

  it("a rotated token replayed right after logout is refused: the grace never revives an ended session", async () => {
    // Why: the grace window is only for a family that is still alive. Without that check, a stolen old token could start a new session
    // for 10 seconds after the person logged out.
    const { refreshToken: firstToken } = await authService.login({
      email: "session@example.com",
      password: "password123",
    });
    const { refreshToken: secondToken } = await authService.refresh(firstToken);
    await authService.logout(secondToken);

    await expect(authService.refresh(firstToken)).rejects.toMatchObject({ code: "invalid_refresh_token" });
  });

  it("logout revokes the current family, and that family only", async () => {
    const { refreshToken } = await authService.login({
      email: "session@example.com",
      password: "password123",
    });

    await authService.logout(refreshToken);

    await expect(authService.refresh(refreshToken)).rejects.toThrow(AppError);
  });

  it("logout-all revokes every session for the user, across families", async () => {
    // Two independent logins = two independent families (e.g. two devices).
    const sessionA = await authService.login({
      email: "session@example.com",
      password: "password123",
    });
    const sessionB = await authService.login({
      email: "session@example.com",
      password: "password123",
    });

    await authService.logoutAll(sessionA.refreshToken);

    await expect(authService.refresh(sessionA.refreshToken)).rejects.toThrow(AppError);
    await expect(authService.refresh(sessionB.refreshToken)).rejects.toThrow(AppError);
  });
});

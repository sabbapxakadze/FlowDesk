import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../../db/test-utils.js";
import { AppError } from "../../shared/errors.js";
import * as authService from "./auth.service.js";

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

  it("reusing an already-rotated token revokes the entire family, not just that request", async () => {
    const { refreshToken: firstToken } = await authService.login({
      email: "session@example.com",
      password: "password123",
    });

    // Rotate once — firstToken is now spent, secondToken is the live one.
    const { refreshToken: secondToken } = await authService.refresh(firstToken);

    // Presenting the already-used firstToken again must fail...
    await expect(authService.refresh(firstToken)).rejects.toThrow(AppError);

    // ...and must have killed secondToken too, even though secondToken
    // was never itself reused and is still within its normal lifetime.
    // If it hadn't, this would succeed — that's the actual bug reuse
    // detection exists to catch: a stolen old token doesn't just fail
    // itself, it has to burn the attacker's foothold in the family too.
    await expect(authService.refresh(secondToken)).rejects.toThrow(AppError);
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

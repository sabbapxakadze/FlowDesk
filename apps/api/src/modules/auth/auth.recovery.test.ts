import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { authTokens, users } from "../../db/schema/index.js";
import { AppError } from "../../shared/errors.js";
import * as authRepository from "./auth.repository.js";
import * as authService from "./auth.service.js";
import { generateOpaqueToken, hashToken } from "./tokens.js";

/**
 * Tokens are hashed at rest (see tokens.ts) — the raw value only ever
 * exists in the email link. `register`/`requestPasswordReset` issue their
 * own tokens internally with no way to intercept the raw value, so these
 * tests issue a second, controlled token through the same repository
 * function they use, giving the test a raw value to actually confirm with.
 */
async function issueControlledToken(
  userId: string,
  purpose: "email_verification" | "password_reset",
) {
  const rawToken = generateOpaqueToken();
  await authRepository.createAuthToken({
    userId,
    purpose,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 60_000),
  });
  return rawToken;
}

describe("auth service — email verification & password reset", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("issues an email_verification token automatically at registration", async () => {
    const { user } = await authService.register({
      email: "verify@example.com",
      password: "password123",
      name: "Verify Me",
      organizationName: "Verify Org",
    });

    const tokens = await db.select().from(authTokens).where(eq(authTokens.userId, user.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.purpose).toBe("email_verification");
    expect(tokens[0]?.usedAt).toBeNull();
  });

  it("rejects a fabricated verification token", async () => {
    await expect(authService.verifyEmail("not-a-real-token")).rejects.toThrow(AppError);
  });

  it("verifying sets emailVerifiedAt, and the same token cannot be used twice", async () => {
    const { user } = await authService.register({
      email: "verify2@example.com",
      password: "password123",
      name: "Verify Twice",
      organizationName: "Verify Twice Org",
    });
    const token = await issueControlledToken(user.id, "email_verification");

    await authService.verifyEmail(token);

    const [updated] = await db.select().from(users).where(eq(users.id, user.id));
    expect(updated?.emailVerifiedAt).not.toBeNull();

    // Single-use, not multi-use — the second attempt with the exact same
    // token must fail even though the user is already verified.
    await expect(authService.verifyEmail(token)).rejects.toThrow(AppError);
  });

  it("requestPasswordReset resolves identically for a real and a nonexistent email", async () => {
    await authService.register({
      email: "reset@example.com",
      password: "password123",
      name: "Reset Me",
      organizationName: "Reset Org",
    });

    // Non-enumeration: neither call throws or otherwise reveals which
    // email is real — for a void-returning function, "identical outward
    // behavior" means both simply resolve.
    await expect(authService.requestPasswordReset("reset@example.com")).resolves.toBeUndefined();
    await expect(
      authService.requestPasswordReset("nobody-real@example.com"),
    ).resolves.toBeUndefined();
  });

  it("confirming a reset changes the password and revokes every existing session", async () => {
    const { user } = await authService.register({
      email: "reset2@example.com",
      password: "old-password123",
      name: "Reset Two",
      organizationName: "Reset Two Org",
    });

    const { refreshToken: sessionBeforeReset } = await authService.login({
      email: "reset2@example.com",
      password: "old-password123",
    });

    const resetToken = await issueControlledToken(user.id, "password_reset");
    await authService.confirmPasswordReset({ token: resetToken, newPassword: "new-password456" });

    // Old password no longer works; new one does.
    await expect(
      authService.login({ email: "reset2@example.com", password: "old-password123" }),
    ).rejects.toThrow(AppError);
    await expect(
      authService.login({ email: "reset2@example.com", password: "new-password456" }),
    ).resolves.toBeDefined();

    // The session that existed *before* the reset is dead — "possible
    // compromise, log out everywhere," not just "password changed."
    await expect(authService.refresh(sessionBeforeReset)).rejects.toThrow(AppError);
  });

  it("rejects an already-used reset token", async () => {
    const { user } = await authService.register({
      email: "reset3@example.com",
      password: "password123",
      name: "Reset Three",
      organizationName: "Reset Three Org",
    });
    const resetToken = await issueControlledToken(user.id, "password_reset");

    await authService.confirmPasswordReset({ token: resetToken, newPassword: "first-new-pass1" });

    await expect(
      authService.confirmPasswordReset({ token: resetToken, newPassword: "second-new-pass2" }),
    ).rejects.toThrow(AppError);
  });

  it("rejects an expired token", async () => {
    const { user } = await authService.register({
      email: "expired@example.com",
      password: "password123",
      name: "Expired",
      organizationName: "Expired Org",
    });

    const rawToken = generateOpaqueToken();
    await authRepository.createAuthToken({
      userId: user.id,
      purpose: "email_verification",
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    await expect(authService.verifyEmail(rawToken)).rejects.toThrow(AppError);
  });
});

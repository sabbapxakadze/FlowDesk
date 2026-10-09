import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../../db/test-utils.js";
import * as authService from "./auth.service.js";

// The mail provider is replaced by one that NEVER answers, to stand in for "a slow email send". Sending is still observable (the mock records
// the call), but nothing waits on it.
const sendPasswordResetEmail = vi.hoisted(() => vi.fn<(to: string, token: string) => Promise<void>>(() => new Promise(() => {})));
vi.mock("../../lib/email.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/email.js")>()),
  sendVerificationEmail: vi.fn(async () => {}),
  sendPasswordResetEmail,
}));

describe("password reset request: the answer does not reveal whether the account exists (ADR 0054)", () => {
  beforeEach(async () => {
    await resetDatabase();
    sendPasswordResetEmail.mockClear();
  });

  it("answers without waiting for the email to be sent, and still sends it", async () => {
    // Why: an account that exists used to make the request wait for the mail provider (hundreds of milliseconds) while an unknown address
    // answered at once, so the response TIME told an attacker which addresses are registered, even though the response itself was identical.
    // With a mail provider that never answers, waiting would hang this test.
    await authService.register({ email: "timing@example.com", password: "password123", name: "Timing", organizationName: "Timing Org" });
    const outcome = await Promise.race([
      authService.requestPasswordReset("timing@example.com").then(() => "answered"),
      new Promise<string>((resolve) => setTimeout(() => resolve("waited for the email"), 2000)),
    ]);
    expect(outcome).toBe("answered");
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0]?.[0]).toBe("timing@example.com");
  });

  it("sends nothing for an address that is not registered, and still answers", async () => {
    // Why: the other half of the same rule: no account, no email, same answer.
    await expect(authService.requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

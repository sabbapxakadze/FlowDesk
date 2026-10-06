import { z } from "zod";
import { connectedAccountSchema } from "./oauth.js";

/**
 * The private account page (email, password, timezone), as opposed to the profile others see (ADR 0028).
 * `pendingEmail` is a new address that was asked for and has not been confirmed yet.
 */
export const accountSchema = z.object({
  email: z.email(),
  emailVerified: z.boolean(),
  pendingEmail: z.email().nullable(),
  /** An IANA timezone name, or null for "use the browser's". */
  timezone: z.string().nullable(),
  /** False for an account made with Google/GitHub that has not added a password (ADR 0042). */
  hasPassword: z.boolean(),
  connectedAccounts: z.array(connectedAccountSchema),
});
export type Account = z.infer<typeof accountSchema>;

export const getAccountResponseSchema = z.object({ data: accountSchema });
export type GetAccountResponse = z.infer<typeof getAccountResponseSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const requestEmailChangeRequestSchema = z.object({
  newEmail: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type RequestEmailChangeRequest = z.infer<typeof requestEmailChangeRequestSchema>;

export const confirmEmailChangeRequestSchema = z.object({ token: z.string().min(1) });
export type ConfirmEmailChangeRequest = z.infer<typeof confirmEmailChangeRequestSchema>;

/** null puts the account back on the browser's own timezone. The server checks the name is a real IANA zone. */
export const updateTimezoneRequestSchema = z.object({ timezone: z.string().min(1).max(64).nullable() });
export type UpdateTimezoneRequest = z.infer<typeof updateTimezoneRequestSchema>;

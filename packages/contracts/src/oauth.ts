import { z } from "zod";

/** The services a person can sign in with besides a password (ADR 0042). */
export const oauthProviderSchema = z.enum(["google", "github"]);
export type OAuthProviderName = z.infer<typeof oauthProviderSchema>;

/** Which providers this server has switched on; the sign-in buttons show only these. */
export const oauthProvidersResponseSchema = z.object({ data: z.object({ providers: z.array(oauthProviderSchema) }) });
export type OAuthProvidersResponse = z.infer<typeof oauthProvidersResponseSchema>;

/** "signin" is Log in / Create account with the provider; "link" connects it to the signed-in account. */
export const startOAuthRequestSchema = z.object({ intent: z.enum(["signin", "link"]) });
export type StartOAuthRequest = z.infer<typeof startOAuthRequestSchema>;

/** Where to send the browser: the provider's own sign-in page. */
export const startOAuthResponseSchema = z.object({ url: z.url() });
export type StartOAuthResponse = z.infer<typeof startOAuthResponseSchema>;

/** One connected provider on the account page. `email` is the provider's address when it was connected. */
export const connectedAccountSchema = z.object({ provider: oauthProviderSchema, email: z.email() });
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;

/** A first password for an account that was made with a provider and has none yet. */
export const setPasswordRequestSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

/**
 * The reasons a provider sign-in can fail, as the `oauth_error` the login or account page is sent back with.
 * Kept here so the API and the notice text on the web agree on the list.
 */
export const OAUTH_ERROR_CODES = [
  "oauth_cancelled",
  "oauth_state_invalid",
  "oauth_exchange_failed",
  "oauth_email_unverified",
  "oauth_identity_taken",
  "oauth_no_organization",
  "oauth_failed",
] as const;
export const oauthErrorCodeSchema = z.enum(OAUTH_ERROR_CODES);
export type OAuthErrorCode = z.infer<typeof oauthErrorCodeSchema>;

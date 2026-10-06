import { exchangeFailed } from "./http.js";
import type { OAuthProfile, OAuthProvider, OAuthProviderName } from "./types.js";

/**
 * A stand-in provider for tests only (the registry hands it out only when NODE_ENV is "test"). Its "authorize URL" is
 * the callback itself, with a `code` that simply encodes the profile to sign in as, so the real state, PKCE-cookie,
 * linking and session code all run with no network. The profile comes from a `hint` (a cookie the test sets); without
 * one, a default person is used.
 */
export const DEFAULT_FAKE_PROFILE: OAuthProfile = {
  providerUserId: "fake-1",
  email: "fake.person@example.com",
  emailVerified: true,
  name: "Fake Person",
};

export function fakeProvider(name: OAuthProviderName): OAuthProvider {
  return {
    name,
    authorizeUrl({ state, redirectUri, hint }) {
      const profile = hint ?? JSON.stringify(DEFAULT_FAKE_PROFILE);
      const url = new URL(redirectUri);
      url.search = new URLSearchParams({ code: Buffer.from(profile).toString("base64url"), state }).toString();
      return url.toString();
    },
    async exchange({ code }) {
      try {
        const parsed = JSON.parse(Buffer.from(code, "base64url").toString("utf8")) as Partial<OAuthProfile>;
        if (typeof parsed.providerUserId !== "string" || typeof parsed.email !== "string") throw new Error("shape");
        return {
          providerUserId: parsed.providerUserId,
          email: parsed.email.toLowerCase().trim(),
          emailVerified: parsed.emailVerified === true,
          name: typeof parsed.name === "string" ? parsed.name : "Fake Person",
        };
      } catch {
        throw exchangeFailed("the fake code is not a profile");
      }
    },
  };
}

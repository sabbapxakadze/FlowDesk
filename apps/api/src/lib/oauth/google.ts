import { asRecord, exchangeFailed, providerFetch } from "./http.js";
import type { OAuthProvider } from "./types.js";

/** Google through OpenID Connect: authorization code + PKCE, then the userinfo endpoint (`sub`, `email`, `email_verified`). */
export function googleProvider(clientId: string, clientSecret: string): OAuthProvider {
  return {
    name: "google",
    authorizeUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      return url.toString();
    },
    async exchange({ code, codeVerifier, redirectUri }) {
      const token = asRecord(
        await providerFetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            code_verifier: codeVerifier,
          }),
        }),
      );
      if (typeof token.access_token !== "string") throw exchangeFailed("google sent no access token");

      const info = asRecord(
        await providerFetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        }),
      );
      if (typeof info.sub !== "string" || typeof info.email !== "string") throw exchangeFailed("google sent no id or email");
      return {
        providerUserId: info.sub,
        email: info.email.toLowerCase().trim(),
        emailVerified: info.email_verified === true,
        name: typeof info.name === "string" && info.name.trim() ? info.name.trim() : info.email.split("@")[0]!,
      };
    },
  };
}

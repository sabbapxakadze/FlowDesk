import { afterEach, describe, expect, it, vi } from "vitest";
import { githubProvider } from "./github.js";
import { googleProvider } from "./google.js";

/**
 * The real adapters, with the network replaced by canned provider answers. No real Google or GitHub call is made here:
 * these tests prove how the answers are READ (the parts where a mistake becomes an account takeover), not that the
 * providers accept our credentials, which only a real round trip can show.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(routes: Record<string, unknown | (() => Response)>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const hit = routes[url];
      if (hit === undefined) return json({}, 404);
      return typeof hit === "function" ? (hit as () => Response)() : json(hit);
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const input = { code: "c", codeVerifier: "v", redirectUri: "http://localhost:5173/api/v1/auth/oauth/x/callback" };

describe("google adapter", () => {
  const google = googleProvider("id", "secret");

  it("builds an authorize URL with PKCE and the state", () => {
    // Why: the state is the CSRF guard and the challenge binds the code to this browser's attempt.
    const url = new URL(google.authorizeUrl({ state: "S", codeChallenge: "CH", redirectUri: input.redirectUri }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "id", state: "S", code_challenge: "CH", code_challenge_method: "S256", response_type: "code" });
  });

  it("reads the id, the lowercased email and whether Google verified it", async () => {
    // Why: email_verified decides whether the email may be trusted for linking.
    const calls = stubFetch({
      "https://oauth2.googleapis.com/token": { access_token: "tok" },
      "https://openidconnect.googleapis.com/v1/userinfo": { sub: "123", email: "Gina@Example.com", email_verified: false, name: "Gina" },
    });
    expect(await google.exchange(input)).toEqual({ providerUserId: "123", email: "gina@example.com", emailVerified: false, name: "Gina" });
    expect(String(calls[0]!.init?.body)).toContain("code_verifier=v"); // the PKCE verifier is sent with the code
  });

  it("a failing provider is one clear error, not a crash", async () => {
    // Why: the callback turns this into a message on the login page.
    stubFetch({ "https://oauth2.googleapis.com/token": () => json({ error: "invalid_grant" }, 400) });
    await expect(google.exchange(input)).rejects.toMatchObject({ code: "oauth_exchange_failed" });
  });
});

describe("github adapter", () => {
  const github = githubProvider("id", "secret");
  const token = { "https://github.com/login/oauth/access_token": { access_token: "tok" } };

  it("takes the PRIMARY email, and only counts it verified when GitHub says so", async () => {
    // Why: /user/emails lists every address, including unverified and non-primary ones; picking the wrong one
    // would let someone sign in as an address they do not control.
    stubFetch({
      ...token,
      "https://api.github.com/user": { id: 42, login: "gina", name: null },
      "https://api.github.com/user/emails": [
        { email: "other@example.com", primary: false, verified: true },
        { email: "Gina@Example.com", primary: true, verified: false },
      ],
    });
    expect(await github.exchange(input)).toEqual({ providerUserId: "42", email: "gina@example.com", emailVerified: false, name: "gina" });
  });

  it("uses the GitHub numeric id as a string and the profile name when there is one", async () => {
    // Why: the id is the stable identity (logins and emails change).
    stubFetch({
      ...token,
      "https://api.github.com/user": { id: 42, login: "gina", name: "Gina G" },
      "https://api.github.com/user/emails": [{ email: "gina@example.com", primary: true, verified: true }],
    });
    expect(await github.exchange(input)).toEqual({ providerUserId: "42", email: "gina@example.com", emailVerified: true, name: "Gina G" });
  });

  it("an account with no primary email is an error", async () => {
    // Why: without an address there is nothing to match or create an account with.
    stubFetch({ ...token, "https://api.github.com/user": { id: 1, login: "x" }, "https://api.github.com/user/emails": [] });
    await expect(github.exchange(input)).rejects.toMatchObject({ code: "oauth_exchange_failed" });
  });
});

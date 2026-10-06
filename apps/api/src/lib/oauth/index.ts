import { env } from "../../config/env.js";
import { fakeProvider } from "./fake.js";
import { githubProvider } from "./github.js";
import { googleProvider } from "./google.js";
import { OAUTH_PROVIDERS, type OAuthProvider, type OAuthProviderName } from "./types.js";

export { OAUTH_PROVIDERS };
export type { OAuthProfile, OAuthProvider, OAuthProviderName } from "./types.js";

/**
 * Which providers are switched on. A real one needs both its client id and secret (config/env.ts refuses half a
 * pair). Under NODE_ENV "test" both names are the fake, so no test ever needs a network or a real credential. In
 * development the same fake can be switched on with OAUTH_FAKE=true to try the whole flow without credentials; it replaces
 * the real providers while it is on. It can never be on in production (config/env.ts refuses to boot, and this check
 * repeats the rule).
 */
function build(): Map<OAuthProviderName, OAuthProvider> {
  const providers = new Map<OAuthProviderName, OAuthProvider>();
  if (env.NODE_ENV === "test" || (env.OAUTH_FAKE === "true" && env.NODE_ENV !== "production")) {
    for (const name of OAUTH_PROVIDERS) providers.set(name, fakeProvider(name));
    return providers;
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.set("google", googleProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET));
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.set("github", githubProvider(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET));
  }
  return providers;
}

const providers = build();

export const enabledProviders = (): OAuthProviderName[] => OAUTH_PROVIDERS.filter((name) => providers.has(name));
export const getProvider = (name: string): OAuthProvider | undefined =>
  (OAUTH_PROVIDERS as readonly string[]).includes(name) ? providers.get(name as OAuthProviderName) : undefined;

/** The URL to register in the provider's console, and the one the provider sends the person back to. */
export const redirectUriFor = (name: OAuthProviderName): string => `${env.APP_URL}/api/v1/auth/oauth/${name}/callback`;

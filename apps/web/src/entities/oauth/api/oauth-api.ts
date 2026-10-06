import { useMutation, useQuery } from "@tanstack/react-query";
import {
  oauthProvidersResponseSchema,
  startOAuthResponseSchema,
  type OAuthProviderName,
  type StartOAuthRequest,
} from "@flowdesk/contracts";
import { apiGet, apiPost } from "../../../shared/api/client";

/** Which providers the server has switched on. The sign-in buttons are drawn from this, so none is ever a dead button. */
export function useOAuthProviders() {
  return useQuery({
    queryKey: ["oauth", "providers"],
    queryFn: () => apiGet("/v1/auth/oauth/providers", oauthProvidersResponseSchema).then((r) => r.data.providers),
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Asks the server for the provider's sign-in URL (a fetch, so "connect" carries the access token), then leaves for it.
 * The mutation stays pending after success on purpose: the page is about to be replaced, so the button keeps its spinner.
 */
export function useStartOAuth(intent: StartOAuthRequest["intent"]) {
  return useMutation({
    mutationFn: (provider: OAuthProviderName) => apiPost(`/v1/auth/oauth/${provider}/start`, { intent }, startOAuthResponseSchema),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

import { useOAuthProviders, useStartOAuth, ProviderButton } from "../../../entities/oauth";
import { ErrorText } from "../../../shared/ui";

/**
 * "Continue with Google / GitHub" and the "or" line above the email form (ADR 0042). It is the same action for logging in
 * and for creating an account: the server signs an existing person in and makes an account for a new one. It draws only
 * the providers the server has switched on, and nothing at all (no empty divider either) when there are none.
 */
export function OAuthButtons() {
  const providers = useOAuthProviders();
  const start = useStartOAuth("signin");
  if (!providers.data || providers.data.length === 0) return null;

  return (
    <div className="mb-5 flex flex-col gap-2.5" data-testid="oauth-buttons">
      {providers.data.map((provider) => (
        <ProviderButton
          key={provider}
          provider={provider}
          pending={start.isPending && start.variables === provider}
          disabled={start.isPending}
          onClick={() => start.mutate(provider)}
        />
      ))}
      {start.isError && <ErrorText>{start.error.message}</ErrorText>}
      <div className="mt-1 flex items-center gap-3 text-xs text-[var(--color-text-muted)]" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--color-border-default)]" />
        or
        <span className="h-px flex-1 bg-[var(--color-border-default)]" />
      </div>
    </div>
  );
}

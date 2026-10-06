import type { OAuthProviderName } from "@flowdesk/contracts";
import { Button } from "../../../shared/ui";
import { PROVIDER_LABELS } from "../lib/provider-labels";
import { ProviderIcon } from "./ProviderIcon";

/** One "Continue with Google" style button; the caller supplies what it does. Shown on the auth pages and the design system. */
export function ProviderButton({
  provider,
  label,
  pending,
  disabled,
  onClick,
}: {
  provider: OAuthProviderName;
  /** Defaults to "Continue with <Provider>". */
  label?: string;
  pending?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      fullWidth
      pending={pending}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2.5 bg-[var(--color-bg-surface)]"
    >
      {!pending && <ProviderIcon provider={provider} />}
      {label ?? `Continue with ${PROVIDER_LABELS[provider]}`}
    </Button>
  );
}
